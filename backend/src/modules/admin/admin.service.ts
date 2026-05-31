import { FastifyInstance } from 'fastify'
import { deleteFile } from '../../lib/storage'

const PAGE_SIZE = 20

const postSelect = {
  id: true, content: true, createdAt: true,
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
  images: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' as const } },
  _count: { select: { likes: true, comments: true } }
}

const commentSelect = {
  id: true, content: true, createdAt: true,
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
  post: { select: { id: true } }
}

export async function getStats(app: FastifyInstance) {
  const [users, posts, comments, jams] = await Promise.all([
    app.prisma.user.count(),
    app.prisma.post.count(),
    app.prisma.postComment.count(),
    app.prisma.jam.count()
  ])
  return { users, posts, comments, jams }
}

export async function listAllPosts(app: FastifyInstance, cursor?: string) {
  const rows = await app.prisma.post.findMany({
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    select: postSelect
  })
  const hasMore = rows.length > PAGE_SIZE
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null }
}

export async function listAllComments(app: FastifyInstance, cursor?: string) {
  const rows = await app.prisma.postComment.findMany({
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    select: commentSelect
  })
  const hasMore = rows.length > PAGE_SIZE
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null }
}

// Admin delete: no ownership check (the requireAdmin guard already authorized it).
export async function adminDeletePost(app: FastifyInstance, postId: string) {
  const post = await app.prisma.post.findUnique({ where: { id: postId }, include: { images: true } })
  if (!post) throw new Error('POST_NOT_FOUND')
  for (const img of post.images) {
    const key = img.url.split('/').slice(-3).join('/')
    await deleteFile(key).catch(() => null)
  }
  await app.prisma.post.delete({ where: { id: postId } })
}

export async function adminDeleteComment(app: FastifyInstance, commentId: string) {
  const comment = await app.prisma.postComment.findUnique({ where: { id: commentId } })
  if (!comment) throw new Error('COMMENT_NOT_FOUND')
  // Cascade in the schema removes any replies to this comment automatically.
  await app.prisma.postComment.delete({ where: { id: commentId } })
}
