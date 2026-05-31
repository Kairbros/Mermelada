import { FastifyInstance } from 'fastify'
import { uploadFile, deleteFile } from '../../lib/storage'
import { notify } from '../../lib/notifications'
import type { CreatePostInput, CreateCommentInput } from './posts.schema'

const PAGE_SIZE = 20
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_POST_IMAGES = 4

const postSelect = {
  id: true, content: true, createdAt: true, updatedAt: true, jamId: true,
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
  images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' as const } },
  _count: { select: { likes: true, comments: true } }
}

export async function createPost(app: FastifyInstance, userId: string, input: CreatePostInput) {
  if (input.jamId) {
    const jam = await app.prisma.jam.findUnique({ where: { id: input.jamId } })
    if (!jam) throw new Error('JAM_NOT_FOUND')
  }
  return app.prisma.post.create({ data: { content: input.content, userId, jamId: input.jamId }, select: postSelect })
}

export async function addPostImages(
  app: FastifyInstance,
  postId: string,
  userId: string,
  files: { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }[]
) {
  const post = await app.prisma.post.findUnique({ where: { id: postId }, include: { images: true } })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (post.userId !== userId) throw new Error('FORBIDDEN')
  if (post.images.length + files.length > MAX_POST_IMAGES) throw new Error('TOO_MANY_IMAGES')

  const created = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) throw new Error('INVALID_FILE_TYPE')
    const buffer = await file.toBuffer()
    if (buffer.length > MAX_IMAGE_SIZE) throw new Error('FILE_TOO_LARGE')
    const ext = file.filename.split('.').pop() ?? 'jpg'
    const key = `posts/${postId}/${Date.now()}-${i}.${ext}`
    const url = await uploadFile(key, buffer, file.mimetype)
    created.push(await app.prisma.postImage.create({ data: { postId, url, order: post.images.length + i } }))
  }
  return created
}

export async function getPost(app: FastifyInstance, postId: string, viewerId?: string) {
  const post = await app.prisma.post.findUnique({ where: { id: postId }, select: postSelect })
  if (!post) throw new Error('POST_NOT_FOUND')
  return withLiked(post, viewerId, app)
}

export async function updatePost(app: FastifyInstance, postId: string, userId: string, content: string) {
  const post = await app.prisma.post.findUnique({ where: { id: postId } })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (post.userId !== userId) throw new Error('FORBIDDEN')
  return app.prisma.post.update({ where: { id: postId }, data: { content }, select: postSelect })
}

export async function deletePost(app: FastifyInstance, postId: string, userId: string) {
  const post = await app.prisma.post.findUnique({ where: { id: postId }, include: { images: true } })
  if (!post) throw new Error('POST_NOT_FOUND')
  if (post.userId !== userId) throw new Error('FORBIDDEN')
  for (const img of post.images) {
    const key = img.url.split('/').slice(-3).join('/')
    await deleteFile(key).catch(() => null)
  }
  await app.prisma.post.delete({ where: { id: postId } })
}

export async function getFeed(app: FastifyInstance, userId: string, cursor?: string) {
  const following = await app.prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true }
  })
  const ids = [...following.map(f => f.followingId), userId]

  const posts = await app.prisma.post.findMany({
    where: { userId: { in: ids } },
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    select: postSelect
  })

  const hasMore = posts.length > PAGE_SIZE
  const items = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? items[items.length - 1].id : null
  return { items: await withLikedBatch(items, userId, app), nextCursor }
}

export async function getUserPosts(
  app: FastifyInstance,
  username: string,
  cursor?: string,
  viewerId?: string
) {
  const user = await app.prisma.user.findUnique({ where: { username } })
  if (!user) throw new Error('USER_NOT_FOUND')

  const posts = await app.prisma.post.findMany({
    where: { userId: user.id },
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    select: postSelect
  })

  const hasMore = posts.length > PAGE_SIZE
  const items = hasMore ? posts.slice(0, PAGE_SIZE) : posts
  const nextCursor = hasMore ? items[items.length - 1].id : null
  return { items: await withLikedBatch(items, viewerId, app), nextCursor }
}

export async function likePost(app: FastifyInstance, postId: string, userId: string) {
  const post = await app.prisma.post.findUnique({ where: { id: postId } })
  if (!post) throw new Error('POST_NOT_FOUND')

  const existing = await app.prisma.postLike.findUnique({ where: { userId_postId: { userId, postId } } })
  if (existing) return

  await app.prisma.postLike.create({ data: { userId, postId } })

  // Don't notify if liking your own post
  if (post.userId !== userId) {
    const liker = await app.prisma.user.findUnique({ where: { id: userId }, select: { username: true, avatarUrl: true } })
    await notify(app.prisma, post.userId, {
      type: 'POST_LIKE',
      postId,
      likerId: userId,
      likerUsername: liker!.username,
      likerAvatarUrl: liker!.avatarUrl
    }).catch(() => null)
  }
}

export async function unlikePost(app: FastifyInstance, postId: string, userId: string) {
  await app.prisma.postLike.deleteMany({ where: { userId, postId } })
}

const commentSelect = {
  id: true, content: true, createdAt: true, parentId: true,
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } }
}

export async function createComment(
  app: FastifyInstance,
  postId: string,
  userId: string,
  input: CreateCommentInput
) {
  const post = await app.prisma.post.findUnique({ where: { id: postId } })
  if (!post) throw new Error('POST_NOT_FOUND')

  if (input.parentId) {
    const parent = await app.prisma.postComment.findUnique({ where: { id: input.parentId } })
    if (!parent || parent.postId !== postId) throw new Error('COMMENT_NOT_FOUND')
    if (parent.parentId) throw new Error('NESTED_REPLY_NOT_ALLOWED')
  }

  const comment = await app.prisma.postComment.create({
    data: { content: input.content, postId, userId, parentId: input.parentId ?? null },
    select: { ...commentSelect, replies: { select: commentSelect, orderBy: { createdAt: 'asc' as const } } }
  })

  const replier = await app.prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, avatarUrl: true }
  })

  if (input.parentId) {
    // Notify parent comment author (if not self)
    const parent = await app.prisma.postComment.findUnique({ where: { id: input.parentId }, select: { userId: true } })
    if (parent && parent.userId !== userId) {
      await notify(app.prisma, parent.userId, {
        type: 'COMMENT_REPLY',
        postId,
        commentId: input.parentId,
        replyId: comment.id,
        replierId: userId,
        replierUsername: replier!.username,
        replierAvatarUrl: replier!.avatarUrl,
        contentPreview: input.content.slice(0, 100)
      }).catch(() => null)
    }
    // Notify post owner too (if different from replier and parent comment author)
    if (post.userId !== userId && post.userId !== (parent?.userId ?? '')) {
      await notify(app.prisma, post.userId, {
        type: 'POST_COMMENT',
        postId,
        commentId: comment.id,
        commenterId: userId,
        commenterUsername: replier!.username,
        commenterAvatarUrl: replier!.avatarUrl,
        contentPreview: input.content.slice(0, 100)
      }).catch(() => null)
    }
  } else if (post.userId !== userId) {
    await notify(app.prisma, post.userId, {
      type: 'POST_COMMENT',
      postId,
      commentId: comment.id,
      commenterId: userId,
      commenterUsername: replier!.username,
      commenterAvatarUrl: replier!.avatarUrl,
      contentPreview: input.content.slice(0, 100)
    }).catch(() => null)
  }

  return comment
}

export async function getComments(app: FastifyInstance, postId: string, cursor?: string) {
  const post = await app.prisma.post.findUnique({ where: { id: postId } })
  if (!post) throw new Error('POST_NOT_FOUND')

  const comments = await app.prisma.postComment.findMany({
    where: { postId, parentId: null },
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'asc' },
    select: {
      ...commentSelect,
      replies: { select: commentSelect, orderBy: { createdAt: 'asc' as const } }
    }
  })

  const hasMore = comments.length > PAGE_SIZE
  const items = hasMore ? comments.slice(0, PAGE_SIZE) : comments
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null }
}

export async function deleteComment(app: FastifyInstance, commentId: string, userId: string, postId: string) {
  const comment = await app.prisma.postComment.findUnique({ where: { id: commentId } })
  if (!comment) throw new Error('COMMENT_NOT_FOUND')
  const post = await app.prisma.post.findUnique({ where: { id: postId }, select: { userId: true } })
  if (!post) throw new Error('POST_NOT_FOUND')
  const isCommentOwner = comment.userId === userId
  const isPostOwner = post.userId === userId
  if (!isCommentOwner && !isPostOwner) throw new Error('FORBIDDEN')
  await app.prisma.postComment.delete({ where: { id: commentId } })
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function withLiked(post: any, userId: string | undefined, app: FastifyInstance) {
  if (!userId) return { ...post, liked: false }
  const like = await app.prisma.postLike.findUnique({
    where: { userId_postId: { userId, postId: post.id } }
  })
  return { ...post, liked: !!like }
}

async function withLikedBatch(posts: any[], userId: string | undefined, app: FastifyInstance) {
  if (!userId || posts.length === 0) return posts.map(p => ({ ...p, liked: false }))
  const likes = await app.prisma.postLike.findMany({
    where: { userId, postId: { in: posts.map(p => p.id) } },
    select: { postId: true }
  })
  const likedSet = new Set(likes.map(l => l.postId))
  return posts.map(p => ({ ...p, liked: likedSet.has(p.id) }))
}
