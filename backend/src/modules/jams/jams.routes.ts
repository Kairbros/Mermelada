import { FastifyInstance } from 'fastify'
import { createJamSchema, updateJamSchema, createTeamSchema } from './jams.schema'
import {
  createJam, listJams, getJam, updateJam, deleteJam,
  publishJam, cancelJam, transitionJam, uploadCover, getCalendar
} from './jams.service'
import {
  joinJam, leaveJam, listParticipants,
  createTeam, listTeams, joinTeam, leaveTeam
} from './participation.service'
import {
  createSubmission, listSubmissions, getSubmission,
  updateSubmission, deleteSubmission, uploadGameFile, addScreenshot, deleteScreenshot
} from './submissions.service'
import { createSubmissionSchema, updateSubmissionSchema } from './submissions.schema'
import { castVote, retractVote, getMyVotes, getResults } from './votes.service'
import { castVoteSchema } from './votes.schema'
import { ErrorSchema, UserPublicSchema, bearer } from '../../lib/swagger-schemas'

const JamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' },
    description: { type: 'string' }, rules: { type: 'string', nullable: true },
    status: { type: 'string' }, theme: { type: 'string', nullable: true },
    themeRevealed: { type: 'boolean' }, teamMode: { type: 'string' },
    maxParticipants: { type: 'number', nullable: true },
    maxTeamSize: { type: 'number', nullable: true },
    coverUrl: { type: 'string', nullable: true },
    startAt: { type: 'string', format: 'date-time' },
    submissionsEndAt: { type: 'string', format: 'date-time' },
    votingEndAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    tags: { type: 'array', items: { type: 'string' } },
    organizer: {
      type: 'object',
      properties: {
        id: { type: 'string' }, username: { type: 'string' },
        displayName: { type: 'string' }, avatarUrl: { type: 'string', nullable: true }
      }
    },
    _count: {
      type: 'object',
      properties: { participants: { type: 'number' }, submissions: { type: 'number' } }
    }
  }
}

const SlugParamSchema = {
  type: 'object',
  required: ['slug'],
  properties: { slug: { type: 'string' } }
}

const SlugTeamParamSchema = {
  type: 'object',
  required: ['slug', 'teamId'],
  properties: { slug: { type: 'string' }, teamId: { type: 'string' } }
}

const ParticipationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    user: UserPublicSchema,
    team: {
      type: 'object',
      nullable: true,
      properties: { id: { type: 'string' }, name: { type: 'string' } }
    }
  }
}

const TeamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    _count: { type: 'object', properties: { members: { type: 'number' } } },
    members: {
      type: 'array',
      items: {
        type: 'object',
        properties: { user: UserPublicSchema }
      }
    }
  }
}

const SlugIdParamSchema = {
  type: 'object',
  required: ['slug', 'id'],
  properties: { slug: { type: 'string' }, id: { type: 'string' } }
}

const SubmissionSchema = {
  type: 'object',
  properties: {
    id:            { type: 'string' },
    title:         { type: 'string' },
    description:   { type: 'string' },
    fileUrl:       { type: 'string', nullable: true },
    fileSizeBytes: { type: 'number', nullable: true },
    externalUrl:   { type: 'string', nullable: true },
    createdAt:     { type: 'string', format: 'date-time' },
    updatedAt:     { type: 'string', format: 'date-time' },
    user:          UserPublicSchema,
    team: {
      type: 'object', nullable: true,
      properties: { id: { type: 'string' }, name: { type: 'string' } }
    },
    screenshots: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, url: { type: 'string' }, order: { type: 'number' } }
      }
    },
    _count: { type: 'object', properties: { votes: { type: 'number' } } }
  }
}

const CreateJamBody = {
  type: 'object',
  required: ['title', 'description', 'theme', 'startAt', 'submissionsEndAt', 'votingEndAt'],
  properties: {
    title:           { type: 'string', minLength: 3, maxLength: 100 },
    description:     { type: 'string', minLength: 10, maxLength: 5000 },
    rules:           { type: 'string', maxLength: 5000 },
    theme:           { type: 'string', description: 'Hidden from participants until jam starts' },
    teamMode:        { type: 'string', enum: ['SOLO_ONLY', 'TEAMS_OPTIONAL', 'TEAMS_ONLY'] },
    maxParticipants: { type: 'number' },
    maxTeamSize:     { type: 'number' },
    tags:            { type: 'array', items: { type: 'string' }, maxItems: 10 },
    startAt:         { type: 'string', format: 'date-time' },
    submissionsEndAt: { type: 'string', format: 'date-time' },
    votingEndAt:     { type: 'string', format: 'date-time' }
  }
}

export async function jamsRoutes(app: FastifyInstance) {
  // GET /jams
  app.get('/', {
    schema: {
      tags: ['Jams'],
      summary: 'List jams',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'SUBMISSIONS', 'VOTING', 'CLOSED'] },
          q:      { type: 'string', description: 'Search by title or tag' },
          cursor: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: JamSchema },
            nextCursor: { type: 'string', nullable: true }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { status, q, cursor } = request.query as { status?: string; q?: string; cursor?: string }
    let requesterId: string | undefined
    try { await request.jwtVerify(); requesterId = (request.user as any).sub } catch {}
    return reply.send(await listJams(app, { status, q, cursor }, requesterId))
  })

  // POST /jams
  app.post('/', {
    schema: {
      tags: ['Jams'],
      summary: 'Create a jam (saved as DRAFT)',
      security: bearer,
      body: CreateJamBody,
      response: { 201: JamSchema, 400: ErrorSchema, 401: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const input = createJamSchema.parse(request.body)
    return reply.code(201).send(await createJam(app, sub, input))
  })

  // GET /jams/calendar
  app.get('/calendar', {
    schema: {
      tags: ['Jams'],
      summary: 'Calendar view — all jams overlapping a given month',
      querystring: {
        type: 'object',
        properties: {
          month: { type: 'integer', minimum: 1, maximum: 12, description: 'Month (1-12), defaults to current month' },
          year:  { type: 'integer', minimum: 2020, description: 'Year (YYYY), defaults to current year' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: { items: { type: 'array', items: JamSchema } }
        }
      }
    }
  }, async (request, reply) => {
    const now = new Date()
    const { month, year } = request.query as { month?: number; year?: number }
    const m = month ?? (now.getMonth() + 1)
    const y = year  ?? now.getFullYear()
    let requesterId: string | undefined
    try { await request.jwtVerify(); requesterId = (request.user as any).sub } catch {}
    return reply.send(await getCalendar(app, m, y, requesterId))
  })

  // GET /jams/:slug
  app.get('/:slug', {
    schema: {
      tags: ['Jams'],
      summary: 'Get jam detail',
      params: SlugParamSchema,
      response: { 200: JamSchema, 404: ErrorSchema }
    }
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    let requesterId: string | undefined
    try { await request.jwtVerify(); requesterId = (request.user as any).sub } catch {}
    return reply.send(await getJam(app, slug, requesterId))
  })

  // PATCH /jams/:slug
  app.patch('/:slug', {
    schema: {
      tags: ['Jams'],
      summary: 'Update a jam (only while DRAFT)',
      security: bearer,
      params: SlugParamSchema,
      body: { ...CreateJamBody, required: [] },
      response: { 200: JamSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    const input = updateJamSchema.parse(request.body)
    return reply.send(await updateJam(app, slug, sub, input))
  })

  // DELETE /jams/:slug
  app.delete('/:slug', {
    schema: {
      tags: ['Jams'],
      summary: 'Delete a jam (only while DRAFT)',
      security: bearer,
      params: SlugParamSchema,
      response: { 204: { type: 'null' }, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    await deleteJam(app, slug, sub)
    return reply.code(204).send()
  })

  // POST /jams/:slug/publish
  app.post('/:slug/publish', {
    schema: {
      tags: ['Jams'],
      summary: 'Publish jam — DRAFT → OPEN, schedules automatic transitions',
      security: bearer,
      params: SlugParamSchema,
      response: { 200: JamSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    return reply.send(await publishJam(app, slug, sub))
  })

  // POST /jams/:slug/cancel
  app.post('/:slug/cancel', {
    schema: {
      tags: ['Jams'],
      summary: 'Cancel a jam (sets status to CLOSED)',
      security: bearer,
      params: SlugParamSchema,
      response: { 200: JamSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    return reply.send(await cancelJam(app, slug, sub))
  })

  // POST /jams/:slug/advance — organizer manually moves the jam to its next phase
  app.post('/:slug/advance', {
    schema: {
      tags: ['Jams'],
      summary: 'Advance a jam to its next phase (organizer only): OPEN→IN_PROGRESS→VOTING→CLOSED',
      security: bearer,
      params: SlugParamSchema,
      response: { 200: JamSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    const { target } = (request.body ?? {}) as { target?: string }
    return reply.send(await transitionJam(app, slug, sub, target))
  })

  // POST /jams/:slug/join
  app.post('/:slug/join', {
    schema: {
      tags: ['Jams'],
      summary: 'Join a jam',
      security: bearer,
      params: SlugParamSchema,
      response: { 201: ParticipationSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    return reply.code(201).send(await joinJam(app, slug, sub))
  })

  // DELETE /jams/:slug/join
  app.delete('/:slug/join', {
    schema: {
      tags: ['Jams'],
      summary: 'Leave a jam',
      security: bearer,
      params: SlugParamSchema,
      response: { 204: { type: 'null' }, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    await leaveJam(app, slug, sub)
    return reply.code(204).send()
  })

  // GET /jams/:slug/participants
  app.get('/:slug/participants', {
    schema: {
      tags: ['Jams'],
      summary: 'List jam participants',
      params: SlugParamSchema,
      querystring: { type: 'object', properties: { cursor: { type: 'string' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: ParticipationSchema },
            nextCursor: { type: 'string', nullable: true }
          }
        },
        404: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const { cursor } = request.query as { cursor?: string }
    return reply.send(await listParticipants(app, slug, cursor))
  })

  // POST /jams/:slug/teams
  app.post('/:slug/teams', {
    schema: {
      tags: ['Jams'],
      summary: 'Create a team (must be a participant, jam must allow teams)',
      security: bearer,
      params: SlugParamSchema,
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 50 } }
      },
      response: { 201: TeamSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    const { name } = createTeamSchema.parse(request.body)
    return reply.code(201).send(await createTeam(app, slug, sub, name))
  })

  // GET /jams/:slug/teams
  app.get('/:slug/teams', {
    schema: {
      tags: ['Jams'],
      summary: 'List jam teams',
      params: SlugParamSchema,
      querystring: { type: 'object', properties: { cursor: { type: 'string' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: TeamSchema },
            nextCursor: { type: 'string', nullable: true }
          }
        },
        404: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const { cursor } = request.query as { cursor?: string }
    return reply.send(await listTeams(app, slug, cursor))
  })

  // POST /jams/:slug/teams/:teamId/join
  app.post('/:slug/teams/:teamId/join', {
    schema: {
      tags: ['Jams'],
      summary: 'Join a team (must already be a jam participant)',
      security: bearer,
      params: SlugTeamParamSchema,
      response: { 200: TeamSchema, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, teamId } = request.params as { slug: string; teamId: string }
    return reply.send(await joinTeam(app, slug, teamId, sub))
  })

  // DELETE /jams/:slug/teams/:teamId/join
  app.delete('/:slug/teams/:teamId/join', {
    schema: {
      tags: ['Jams'],
      summary: 'Leave a team (stays as jam participant)',
      security: bearer,
      params: SlugTeamParamSchema,
      response: { 204: { type: 'null' }, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, teamId } = request.params as { slug: string; teamId: string }
    await leaveTeam(app, slug, teamId, sub)
    return reply.code(204).send()
  })

  // ── Submissions ──────────────────────────────────────────────────────────

  // POST /jams/:slug/submissions
  app.post('/:slug/submissions', {
    schema: {
      tags: ['Submissions'],
      summary: 'Create a submission (jam must be IN_PROGRESS, must be a participant)',
      security: bearer,
      params: SlugParamSchema,
      body: {
        type: 'object',
        required: ['title', 'description'],
        properties: {
          title:       { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', minLength: 1, maxLength: 2000 },
          externalUrl: { type: 'string', format: 'uri', description: 'Optional hosted game URL' }
        }
      },
      response: { 201: SubmissionSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    const input = createSubmissionSchema.parse(request.body)
    return reply.code(201).send(await createSubmission(app, slug, sub, input))
  })

  // GET /jams/:slug/submissions
  app.get('/:slug/submissions', {
    schema: {
      tags: ['Submissions'],
      summary: 'List submissions (private until VOTING opens; before that only your own/team or the organizer)',
      params: SlugParamSchema,
      querystring: { type: 'object', properties: { cursor: { type: 'string' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array', items: SubmissionSchema },
            nextCursor: { type: 'string', nullable: true }
          }
        },
        400: ErrorSchema, 404: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const { cursor } = request.query as { cursor?: string }
    let viewerId: string | undefined
    try { await request.jwtVerify(); viewerId = (request.user as any).sub } catch {}
    return reply.send(await listSubmissions(app, slug, cursor, viewerId))
  })

  // GET /jams/:slug/submissions/:id
  app.get('/:slug/submissions/:id', {
    schema: {
      tags: ['Submissions'],
      summary: 'Get a single submission (private until VOTING; before that only owner/team or organizer)',
      params: SlugIdParamSchema,
      response: { 200: SubmissionSchema, 400: ErrorSchema, 404: ErrorSchema }
    }
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string }
    let viewerId: string | undefined
    try { await request.jwtVerify(); viewerId = (request.user as any).sub } catch {}
    return reply.send(await getSubmission(app, slug, id, viewerId))
  })

  // PATCH /jams/:slug/submissions/:id
  app.patch('/:slug/submissions/:id', {
    schema: {
      tags: ['Submissions'],
      summary: 'Update a submission (only while jam is IN_PROGRESS)',
      security: bearer,
      params: SlugIdParamSchema,
      body: {
        type: 'object',
        properties: {
          title:       { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', minLength: 1, maxLength: 2000 },
          externalUrl: { type: 'string', format: 'uri', nullable: true }
        }
      },
      response: { 200: SubmissionSchema, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, id } = request.params as { slug: string; id: string }
    const input = updateSubmissionSchema.parse(request.body)
    return reply.send(await updateSubmission(app, slug, id, sub, input))
  })

  // DELETE /jams/:slug/submissions/:id
  app.delete('/:slug/submissions/:id', {
    schema: {
      tags: ['Submissions'],
      summary: 'Delete a submission (only while jam is IN_PROGRESS)',
      security: bearer,
      params: SlugIdParamSchema,
      response: { 204: { type: 'null' }, 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, id } = request.params as { slug: string; id: string }
    await deleteSubmission(app, slug, id, sub)
    return reply.code(204).send()
  })

  // POST /jams/:slug/submissions/:id/file  (multipart, up to 2GB)
  app.post('/:slug/submissions/:id/file', {
    schema: {
      tags: ['Submissions'],
      summary: 'Upload game file (multipart/form-data, field: file, max 2GB, streams directly to MinIO)',
      security: bearer,
      consumes: ['multipart/form-data'],
      params: SlugIdParamSchema,
      response: {
        200: {
          type: 'object',
          properties: { fileUrl: { type: 'string' }, fileSizeBytes: { type: 'number' } }
        },
        400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema
      }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, id } = request.params as { slug: string; id: string }
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: 'No file provided' })
    return reply.send(await uploadGameFile(app, slug, id, sub, file))
  })

  // POST /jams/:slug/submissions/:id/screenshots  (multipart, max 5, 10MB each)
  app.post('/:slug/submissions/:id/screenshots', {
    schema: {
      tags: ['Submissions'],
      summary: 'Add a screenshot (multipart/form-data, field: file, JPEG/PNG/WebP, max 10MB, max 5 total)',
      security: bearer,
      consumes: ['multipart/form-data'],
      params: SlugIdParamSchema,
      response: {
        201: {
          type: 'object',
          properties: { id: { type: 'string' }, url: { type: 'string' }, order: { type: 'number' } }
        },
        400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema
      }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, id } = request.params as { slug: string; id: string }
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: 'No file provided' })
    return reply.code(201).send(await addScreenshot(app, slug, id, sub, file))
  })

  // DELETE /jams/:slug/submissions/:id/screenshots/:screenshotId
  app.delete('/:slug/submissions/:id/screenshots/:screenshotId', {
    schema: {
      tags: ['Submissions'],
      summary: 'Delete a screenshot (owner only, jam must be IN_PROGRESS)',
      security: bearer,
      params: {
        type: 'object',
        required: ['slug', 'id', 'screenshotId'],
        properties: { slug: { type: 'string' }, id: { type: 'string' }, screenshotId: { type: 'string' } }
      },
      response: { 204: { type: 'null' }, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, id, screenshotId } = request.params as { slug: string; id: string; screenshotId: string }
    await deleteScreenshot(app, slug, id, screenshotId, sub)
    return reply.code(204).send()
  })

  // ── Voting ───────────────────────────────────────────────────────────────

  const VoteSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' }, score: { type: 'number' },
      comment: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      submission: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' } } },
      voter: UserPublicSchema
    }
  }

  const ResultItemSchema = {
    type: 'object',
    properties: {
      rank:      { type: 'number' },
      avgScore:  { type: 'number' },
      voteCount: { type: 'number' },
      submission: SubmissionSchema
    }
  }

  const MyVotesSchema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            submissionId: { type: 'string' },
            score:        { type: 'number' },
            comment:      { type: 'string', nullable: true }
          }
        }
      }
    }
  }

  // POST /jams/:slug/votes — rate a submission (creates or updates your rating for it)
  app.post('/:slug/votes', {
    schema: {
      tags: ['Voting'],
      summary: 'Rate a submission 1-10 (jam must be VOTING; participants and the organizer may vote; one rating per submission)',
      security: bearer,
      params: SlugParamSchema,
      body: {
        type: 'object',
        required: ['submissionId', 'score'],
        properties: {
          submissionId: { type: 'string' },
          score:        { type: 'number', minimum: 1, maximum: 10 },
          comment:      { type: 'string', maxLength: 750, description: '~125 words max' }
        }
      },
      response: { 201: VoteSchema, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    const input = castVoteSchema.parse(request.body)
    return reply.code(201).send(await castVote(app, slug, sub, input))
  })

  // DELETE /jams/:slug/votes/:submissionId — remove your rating for one submission
  app.delete('/:slug/votes/:submissionId', {
    schema: {
      tags: ['Voting'],
      summary: 'Retract your rating for a submission',
      security: bearer,
      params: {
        type: 'object',
        required: ['slug', 'submissionId'],
        properties: { slug: { type: 'string' }, submissionId: { type: 'string' } }
      },
      response: { 204: { type: 'null' }, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug, submissionId } = request.params as { slug: string; submissionId: string }
    await retractVote(app, slug, sub, submissionId)
    return reply.code(204).send()
  })

  // GET /jams/:slug/votes/me — all of your ratings for this jam
  app.get('/:slug/votes/me', {
    schema: {
      tags: ['Voting'],
      summary: 'Get all your ratings for this jam',
      security: bearer,
      params: SlugParamSchema,
      response: { 200: MyVotesSchema, 401: ErrorSchema, 404: ErrorSchema }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    return reply.send(await getMyVotes(app, slug, sub))
  })

  // GET /jams/:slug/results
  app.get('/:slug/results', {
    schema: {
      tags: ['Voting'],
      summary: 'Get ranked results (only available when jam is CLOSED)',
      params: SlugParamSchema,
      response: {
        200: {
          type: 'object',
          properties: { items: { type: 'array', items: ResultItemSchema } }
        },
        400: ErrorSchema, 404: ErrorSchema
      }
    }
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    return reply.send(await getResults(app, slug))
  })

  // POST /jams/:slug/cover
  app.post('/:slug/cover', {
    schema: {
      tags: ['Jams'],
      summary: 'Upload jam cover image (multipart/form-data, field: file, max 5MB)',
      security: bearer,
      consumes: ['multipart/form-data'],
      params: SlugParamSchema,
      querystring: { type: 'object', properties: { position: { type: 'integer', minimum: 0, maximum: 100 } } },
      response: {
        200: { type: 'object', properties: { coverUrl: { type: 'string' } } },
        400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema
      }
    },
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { slug } = request.params as { slug: string }
    const { position } = request.query as { position?: number }
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: 'No file provided' })
    return reply.send(await uploadCover(app, slug, sub, file, position ?? 50))
  })
}
