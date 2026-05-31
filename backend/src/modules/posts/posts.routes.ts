import { FastifyInstance } from 'fastify'
import { createPostSchema, createCommentSchema } from './posts.schema'
import {
  createPost, addPostImages, getPost, updatePost, deletePost, getFeed,
  likePost, unlikePost, createComment, getComments, deleteComment
} from './posts.service'
import {
  ErrorSchema, PostSchema, CommentSchema,
  PaginatedPostsSchema, PaginatedCommentsSchema,
  CursorQuerySchema, IdParamSchema, bearer
} from '../../lib/swagger-schemas'

export async function postsRoutes(app: FastifyInstance) {
  // POST /posts
  app.post('/', {
    schema: {
      tags: ['Posts'],
      summary: 'Create a post',
      security: bearer,
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 500 },
          jamId:   { type: 'string', description: 'Optional: link post to a jam' }
        }
      },
      response: { 201: PostSchema, 401: ErrorSchema, 400: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const input = createPostSchema.parse(request.body)
    return reply.code(201).send(await createPost(app, sub, input))
  })

  // POST /posts/:id/images
  app.post('/:id/images', {
    schema: {
      tags: ['Posts'],
      summary: 'Upload images to a post (multipart/form-data, field: file, max 4 images, 10MB each)',
      security: bearer,
      consumes: ['multipart/form-data'],
      params: IdParamSchema,
      response: {
        201: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, url: { type: 'string' }, order: { type: 'number' } } } },
        400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema
      }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    const parts = request.files()
    const files: { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }[] = []
    for await (const part of parts) {
      const buffer = await part.toBuffer()
      files.push({ filename: part.filename, mimetype: part.mimetype, toBuffer: () => Promise.resolve(buffer) })
    }
    if (files.length === 0) return reply.code(400).send({ error: 'No files provided' })
    try {
      return reply.code(201).send(await addPostImages(app, id, sub, files))
    } catch (err: any) {
      if (err.message === 'INVALID_FILE_TYPE') return reply.code(415).send({ error: 'Unsupported format. Use JPEG, PNG, WebP or GIF.' })
      if (err.message === 'FILE_TOO_LARGE') return reply.code(413).send({ error: 'Image exceeds the 10 MB limit.' })
      if (err.message === 'TOO_MANY_IMAGES') return reply.code(400).send({ error: 'Post already has 4 images.' })
      throw err
    }
  })

  // GET /posts/feed  — must come before /:id
  app.get('/feed', {
    schema: {
      tags: ['Posts'],
      summary: 'Get feed (posts from followed users + own posts)',
      security: bearer,
      querystring: CursorQuerySchema,
      response: { 200: PaginatedPostsSchema, 401: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { cursor } = request.query as { cursor?: string }
    return reply.send(await getFeed(app, sub, cursor))
  })

  // GET /posts/:id
  app.get('/:id', {
    schema: {
      tags: ['Posts'],
      summary: 'Get a single post',
      params: IdParamSchema,
      response: { 200: PostSchema, 404: ErrorSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const viewerId = await getOptionalUserId(request)
    return reply.send(await getPost(app, id, viewerId))
  })

  // PATCH /posts/:id
  app.patch('/:id', {
    schema: {
      tags: ['Posts'],
      summary: 'Edit a post (owner only)',
      security: bearer,
      params: IdParamSchema,
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1, maxLength: 500 } }
      },
      response: { 200: PostSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: string }
    return reply.send(await updatePost(app, id, sub, content))
  })

  // DELETE /posts/:id
  app.delete('/:id', {
    schema: {
      tags: ['Posts'],
      summary: 'Delete a post (owner only)',
      security: bearer,
      params: IdParamSchema,
      response: { 204: { type: 'null' }, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    await deletePost(app, id, sub)
    return reply.code(204).send()
  })

  // POST /posts/:id/like
  app.post('/:id/like', {
    schema: {
      tags: ['Posts'],
      summary: 'Like a post',
      security: bearer,
      params: IdParamSchema,
      response: { 204: { type: 'null' }, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    await likePost(app, id, sub)
    return reply.code(204).send()
  })

  // DELETE /posts/:id/like
  app.delete('/:id/like', {
    schema: {
      tags: ['Posts'],
      summary: 'Unlike a post',
      security: bearer,
      params: IdParamSchema,
      response: { 204: { type: 'null' }, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    await unlikePost(app, id, sub)
    return reply.code(204).send()
  })

  // GET /posts/:id/comments
  app.get('/:id/comments', {
    schema: {
      tags: ['Posts'],
      summary: 'Get comments on a post',
      params: IdParamSchema,
      querystring: CursorQuerySchema,
      response: { 200: PaginatedCommentsSchema, 404: ErrorSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { cursor } = request.query as { cursor?: string }
    return reply.send(await getComments(app, id, cursor))
  })

  // POST /posts/:id/comments
  app.post('/:id/comments', {
    schema: {
      tags: ['Posts'],
      summary: 'Add a comment (or reply) to a post',
      security: bearer,
      params: IdParamSchema,
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content:  { type: 'string', minLength: 1, maxLength: 300 },
          parentId: { type: 'string', description: 'ID of comment being replied to (one level deep only)' }
        }
      },
      response: { 201: CommentSchema, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    const input = createCommentSchema.parse(request.body)
    return reply.code(201).send(await createComment(app, id, sub, input))
  })

  // DELETE /posts/:id/comments/:commentId
  app.delete('/:id/comments/:commentId', {
    schema: {
      tags: ['Posts'],
      summary: 'Delete a comment (comment owner or post owner)',
      security: bearer,
      params: {
        type: 'object',
        required: ['id', 'commentId'],
        properties: { id: { type: 'string' }, commentId: { type: 'string' } }
      },
      response: { 204: { type: 'null' }, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id, commentId } = request.params as { id: string; commentId: string }
    await deleteComment(app, commentId, sub, id)
    return reply.code(204).send()
  })
}

async function getOptionalUserId(request: any): Promise<string | undefined> {
  try {
    await request.jwtVerify()
    return (request.user as { sub: string }).sub
  } catch {
    return undefined
  }
}
