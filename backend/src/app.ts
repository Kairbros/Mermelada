import Fastify, { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { ZodError } from 'zod'
import { prismaPlugin } from './plugins/prisma'
import { redisPlugin } from './plugins/redis'
import { jwtPlugin } from './plugins/jwt'
import { authRoutes } from './modules/auth/auth.routes'
import { usersRoutes } from './modules/users/users.routes'
import { postsRoutes } from './modules/posts/posts.routes'
import { jamsRoutes } from './modules/jams/jams.routes'
import { notificationsRoutes } from './modules/notifications/notifications.routes'
import { adminRoutes } from './modules/admin/admin.routes'

const ERROR_MAP: Record<string, { statusCode: number; message: string }> = {
  EMAIL_TAKEN:            { statusCode: 409, message: 'Email already in use' },
  USERNAME_TAKEN:         { statusCode: 409, message: 'Username already taken' },
  INVALID_CREDENTIALS:    { statusCode: 401, message: 'Invalid email or password' },
  ACCOUNT_BANNED:         { statusCode: 403, message: 'This account has been banned' },
  INVALID_REFRESH_TOKEN:  { statusCode: 401, message: 'Invalid or expired session' },
  INVALID_TOKEN:          { statusCode: 400, message: 'Invalid or expired token' },
  USER_NOT_FOUND:         { statusCode: 404, message: 'User not found' },
  INVALID_FILE_TYPE:      { statusCode: 400, message: 'File must be JPEG, PNG, WebP or GIF' },
  FILE_TOO_LARGE:         { statusCode: 413, message: 'File exceeds size limit' },
  CANNOT_FOLLOW_SELF:     { statusCode: 400, message: 'You cannot follow yourself' },
  POST_NOT_FOUND:         { statusCode: 404, message: 'Post not found' },
  COMMENT_NOT_FOUND:      { statusCode: 404, message: 'Comment not found' },
  JAM_NOT_FOUND:          { statusCode: 404, message: 'Jam not found' },
  TOO_MANY_IMAGES:        { statusCode: 400, message: 'A post can have at most 4 images' },
  FORBIDDEN:              { statusCode: 403, message: 'You do not have permission to do that' },
  JAM_ALREADY_PUBLISHED:  { statusCode: 400, message: 'Jam has already been published' },
  JAM_CANNOT_CANCEL:      { statusCode: 400, message: 'Jam cannot be cancelled in its current state' },
  JAM_NOT_OPEN:           { statusCode: 400, message: 'Jam is not open for participation' },
  JAM_FULL:               { statusCode: 400, message: 'Jam has reached its participant limit' },
  ALREADY_PARTICIPATING:  { statusCode: 409, message: 'You are already participating in this jam' },
  NOT_PARTICIPATING:      { statusCode: 400, message: 'You are not participating in this jam' },
  TEAMS_NOT_ALLOWED:      { statusCode: 400, message: 'This jam does not allow teams' },
  TEAM_NOT_FOUND:         { statusCode: 404, message: 'Team not found' },
  ALREADY_IN_TEAM:        { statusCode: 409, message: 'You are already in a team' },
  NOT_IN_TEAM:            { statusCode: 400, message: 'You are not in this team' },
  TEAM_FULL:              { statusCode: 400, message: 'Team has reached its size limit' },
  CANNOT_LEAVE_AFTER_SUBMISSION: { statusCode: 400, message: 'You cannot leave a jam after submitting' },
  SUBMISSION_NOT_FOUND:   { statusCode: 404, message: 'Submission not found' },
  JAM_NOT_IN_PROGRESS:    { statusCode: 400, message: 'Jam is not currently accepting submissions' },
  TEAM_REQUIRED:          { statusCode: 400, message: 'This jam requires you to be in a team before submitting' },
  TOO_MANY_SCREENSHOTS:   { statusCode: 400, message: 'Submission can have at most 5 screenshots' },
  VOTING_NOT_OPEN:        { statusCode: 400, message: 'Voting is not currently open for this jam' },
  VOTE_NOT_FOUND:         { statusCode: 404, message: 'You have not voted in this jam' },
  CANNOT_VOTE_OWN:        { statusCode: 400, message: 'You cannot vote for your own submission' },
  RESULTS_NOT_READY:      { statusCode: 400, message: 'Results are not available until the jam is closed' },
  NOTIFICATION_NOT_FOUND: { statusCode: 404, message: 'Notification not found' },
}

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : true
  })

  app.register(swagger, {
    openapi: {
      info: { title: 'JamHub API', version: '0.1.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
      }
    }
  })

  app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true }
  })

  app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true
  })

  app.register(cookie)

  app.register(jwt, {
    secret: process.env.JWT_SECRET!
  })

  app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }
  })

  // Thunder Client / browsers send this content-type on bodyless requests
  app.addContentTypeParser('application/x-www-form-urlencoded', (_req, _body, done) => {
    done(null, {})
  })

  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  })

  app.register(prismaPlugin)
  app.register(redisPlugin)
  app.register(jwtPlugin)

  app.register(authRoutes, { prefix: '/auth' })
  app.register(usersRoutes, { prefix: '/users' })
  app.register(postsRoutes, { prefix: '/posts' })
  app.register(jamsRoutes, { prefix: '/jams' })
  app.register(notificationsRoutes, { prefix: '/notifications' })
  app.register(adminRoutes, { prefix: '/admin' })

  app.setErrorHandler((error: FastifyError | ZodError | Error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation error',
        details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      })
    }

    // Fastify/AJV schema validation (body, querystring or params) — return a
    // readable 400 instead of letting it fall through to a generic 500.
    const fe = error as FastifyError & {
      validation?: { instancePath?: string; message?: string; params?: { missingProperty?: string } }[]
      validationContext?: string
    }
    if (fe.validation) {
      return reply.code(400).send({
        error: 'Validation error',
        details: fe.validation.map(v => {
          const field = v.instancePath
            ? v.instancePath.replace(/^\//, '').replace(/\//g, '.')
            : v.params?.missingProperty ?? (fe.validationContext ?? 'body')
          return { field, message: v.message ?? 'Invalid value' }
        })
      })
    }

    const mapped = ERROR_MAP[error.message]
    if (mapped) {
      return reply.code(mapped.statusCode).send({ error: mapped.message })
    }

    // Prisma unique constraint violation (e.g. concurrent double-join)
    if ((error as { code?: string }).code === 'P2002') {
      return reply.code(409).send({ error: 'Resource already exists' })
    }

    // Prisma serialization failure / write conflict (concurrent capacity check)
    if ((error as { code?: string }).code === 'P2034') {
      return reply.code(409).send({ error: 'Conflicting concurrent request, please try again' })
    }

    // Framework errors that already carry a client-side status (rate limit 429,
    // auth 401, unsupported media type, etc.) — preserve it instead of masking as 500.
    if (typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.code(fe.statusCode).send({ error: error.message || 'Request error' })
    }

    app.log.error(error)
    return reply.code(500).send({ error: 'Internal server error' })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}