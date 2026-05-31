import { FastifyInstance } from 'fastify'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from './auth.schema'
import * as AuthService from './auth.service'
import {
  ErrorSchema, OkSchema, AuthResponseSchema, bearer
} from '../../lib/swagger-schemas'

const REFRESH_COOKIE = 'refresh_token'

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60
}

function safeUser(user: {
  id: string; username: string; displayName: string
  email: string; avatarUrl: string | null; isVerified: boolean; isAdmin?: boolean
}) {
  return { id: user.id, username: user.username, displayName: user.displayName,
           email: user.email, avatarUrl: user.avatarUrl, isVerified: user.isVerified,
           isAdmin: user.isAdmin ?? false }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['username', 'displayName', 'email', 'password'],
        properties: {
          username:    { type: 'string', minLength: 3, maxLength: 30, description: 'Only letters, numbers, underscores' },
          displayName: { type: 'string', minLength: 1, maxLength: 50 },
          email:       { type: 'string', format: 'email' },
          password:    { type: 'string', minLength: 8, maxLength: 72 }
        }
      },
      response: {
        201: AuthResponseSchema.properties.user,
        409: ErrorSchema,
        400: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const input = registerSchema.parse(request.body)
    const user = await AuthService.register(app, input)
    return reply.code(201).send(safeUser(user))
  })

  app.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login — returns accessToken and sets refresh cookie',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      },
      response: {
        200: AuthResponseSchema,
        401: ErrorSchema,
        403: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const { user, accessToken, refreshToken } = await AuthService.login(app, input)
    reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions)
    return reply.send({ accessToken, user: safeUser(user) })
  })

  app.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Get new accessToken using the httpOnly refresh cookie',
      response: {
        200: AuthResponseSchema,
        401: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE]
    if (!token) return reply.code(401).send({ error: 'No refresh token' })
    const { accessToken, user } = await AuthService.refresh(app, token)
    return reply.send({ accessToken, user: safeUser(user) })
  })

  app.post('/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Logout — clears the refresh cookie',
      response: { 200: OkSchema }
    }
  }, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE]
    if (token) await AuthService.logout(app, token)
    reply.clearCookie(REFRESH_COOKIE, { path: '/' })
    return reply.send({ ok: true })
  })

  app.get('/verify-email', {
    schema: {
      tags: ['Auth'],
      summary: 'Verify email address using token from email link',
      querystring: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string' } }
      },
      response: {
        200: OkSchema,
        400: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { token } = request.query as { token?: string }
    if (!token) return reply.code(400).send({ error: 'Missing token' })
    await AuthService.verifyEmail(app, token)
    return reply.send({ ok: true })
  })

  app.post('/forgot-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Send password reset email',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } }
      },
      response: { 200: OkSchema }
    }
  }, async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body)
    await AuthService.forgotPassword(app, email)
    return reply.send({ ok: true })
  })

  app.post('/reset-password', {
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using token from email',
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token:    { type: 'string' },
          password: { type: 'string', minLength: 8, maxLength: 72 }
        }
      },
      response: {
        200: OkSchema,
        400: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { token, password } = resetPasswordSchema.parse(request.body)
    await AuthService.resetPassword(app, token, password)
    return reply.send({ ok: true })
  })
}
