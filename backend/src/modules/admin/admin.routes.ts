import { FastifyInstance } from 'fastify'
import {
  getStats, listAllPosts, listAllComments, adminDeletePost, adminDeleteComment
} from './admin.service'
import {
  ErrorSchema, PostSchema, CommentSchema, UserPublicSchema,
  CursorQuerySchema, IdParamSchema, bearer
} from '../../lib/swagger-schemas'

const StatsSchema = {
  type: 'object',
  properties: {
    users:    { type: 'number' },
    posts:    { type: 'number' },
    comments: { type: 'number' },
    jams:     { type: 'number' }
  }
}

const AdminCommentSchema = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    content:   { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    user:      UserPublicSchema,
    post:      { type: 'object', properties: { id: { type: 'string' } } }
  }
}

export async function adminRoutes(app: FastifyInstance) {
  // Every route in this module requires an admin.
  app.addHook('onRequest', app.requireAdmin)

  // GET /admin/stats
  app.get('/stats', {
    schema: {
      tags: ['Admin'],
      summary: 'Moderation dashboard counts (admin only)',
      security: bearer,
      response: { 200: StatsSchema, 401: ErrorSchema, 403: ErrorSchema }
    }
  }, async (_request, reply) => {
    return reply.send(await getStats(app))
  })

  // GET /admin/posts
  app.get('/posts', {
    schema: {
      tags: ['Admin'],
      summary: 'List all posts, newest first (admin only)',
      security: bearer,
      querystring: CursorQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: PostSchema },
            nextCursor: { type: 'string', nullable: true }
          }
        },
        401: ErrorSchema, 403: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { cursor } = request.query as { cursor?: string }
    return reply.send(await listAllPosts(app, cursor))
  })

  // GET /admin/comments
  app.get('/comments', {
    schema: {
      tags: ['Admin'],
      summary: 'List all comments, newest first (admin only)',
      security: bearer,
      querystring: CursorQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: AdminCommentSchema },
            nextCursor: { type: 'string', nullable: true }
          }
        },
        401: ErrorSchema, 403: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { cursor } = request.query as { cursor?: string }
    return reply.send(await listAllComments(app, cursor))
  })

  // DELETE /admin/posts/:id
  app.delete('/posts/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Delete any post (admin only)',
      security: bearer,
      params: IdParamSchema,
      response: { 204: { type: 'null' }, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await adminDeletePost(app, id)
    return reply.code(204).send()
  })

  // DELETE /admin/comments/:id
  app.delete('/comments/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Delete any comment (admin only)',
      security: bearer,
      params: IdParamSchema,
      response: { 204: { type: 'null' }, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await adminDeleteComment(app, id)
    return reply.code(204).send()
  })
}
