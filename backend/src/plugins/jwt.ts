import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string }
    // request.user is the decoded payload — it contains `sub` (the user id), not `id`
    user: { sub: string; email: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export const jwtPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // Verifies a valid token AND that the user is an admin (checked live against the DB,
  // so revoking admin takes effect immediately without waiting for token expiry).
  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    const { sub } = request.user as { sub: string }
    const user = await app.prisma.user.findUnique({ where: { id: sub }, select: { isAdmin: true } })
    if (!user?.isAdmin) return reply.code(403).send({ error: 'FORBIDDEN' })
  })
})