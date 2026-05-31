import { FastifyInstance } from 'fastify'
import { uploadFile, deleteFile } from '../../lib/storage'
import { scheduleJamTransition, jamQueue, jamJobId } from '../../lib/queue'
import type { JamJobData } from '../../lib/queue'
import { notifyMany } from '../../lib/notifications'
import type { CreateJamInput, UpdateJamInput } from './jams.schema'

const PAGE_SIZE = 20
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_COVER_SIZE = 5 * 1024 * 1024

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function uniqueSlug(app: FastifyInstance, title: string): Promise<string> {
  const base = slugify(title)
  let slug = base
  let i = 1
  while (await app.prisma.jam.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`
  }
  return slug
}

const jamSelect = {
  id: true, slug: true, title: true, description: true, rules: true,
  status: true, teamMode: true, themeRevealed: true,
  maxParticipants: true, maxTeamSize: true, coverUrl: true,
  startAt: true, submissionsEndAt: true, votingEndAt: true,
  createdAt: true, updatedAt: true,
  organizer: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
  tags: { select: { tag: true } },
  _count: { select: { participants: true, submissions: true } }
}

function formatJam(jam: any, requesterId?: string) {
  const isOrganizer = requesterId && jam.organizer?.id === requesterId
  return {
    ...jam,
    theme: (jam.themeRevealed || isOrganizer) ? jam.theme : null,
    tags: jam.tags.map((t: any) => t.tag)
  }
}

export async function createJam(app: FastifyInstance, organizerId: string, input: CreateJamInput) {
  const slug = await uniqueSlug(app, input.title)
  const { tags, ...rest } = input

  const jam = await app.prisma.jam.create({
    data: {
      ...rest,
      slug,
      organizerId,
      tags: { create: tags.map(tag => ({ tag })) }
    },
    select: { ...jamSelect, theme: true }
  })

  return formatJam(jam, organizerId)
}

export async function getCalendar(
  app: FastifyInstance,
  month: number,
  year: number,
  requesterId?: string
) {
  const from = new Date(year, month - 1, 1)           // first day of month (local)
  const to   = new Date(year, month, 0, 23, 59, 59)   // last day of month

  // Any jam that overlaps the month: starts before end of month AND ends after start of month
  const jams = await app.prisma.jam.findMany({
    where: {
      status: { not: 'DRAFT' },
      startAt:    { lte: to },
      votingEndAt: { gte: from }
    },
    orderBy: { startAt: 'asc' },
    select: { ...jamSelect, theme: true }
  })

  return { items: jams.map(j => formatJam(j, requesterId)) }
}

export async function listJams(
  app: FastifyInstance,
  filters: { status?: string; q?: string; cursor?: string },
  requesterId?: string
) {
  const where: any = {}
  if (filters.status) where.status = filters.status
  else where.status = { not: 'DRAFT' }
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { tags: { some: { tag: { contains: filters.q, mode: 'insensitive' } } } }
    ]
  }

  const jams = await app.prisma.jam.findMany({
    where,
    take: PAGE_SIZE + 1,
    ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    orderBy: { startAt: 'desc' },
    select: { ...jamSelect, theme: true }
  })

  const hasMore = jams.length > PAGE_SIZE
  const items = hasMore ? jams.slice(0, PAGE_SIZE) : jams
  return {
    items: items.map(j => formatJam(j, requesterId)),
    nextCursor: hasMore ? items[items.length - 1].id : null
  }
}

export async function getUserJams(
  app: FastifyInstance,
  username: string,
  cursor?: string,
  requesterId?: string
) {
  const user = await app.prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (!user) throw new Error('USER_NOT_FOUND')

  // Only the organizer themself sees their drafts
  const where: any = { organizerId: user.id }
  if (user.id !== requesterId) where.status = { not: 'DRAFT' }

  const jams = await app.prisma.jam.findMany({
    where,
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    select: { ...jamSelect, theme: true }
  })

  const hasMore = jams.length > PAGE_SIZE
  const items = hasMore ? jams.slice(0, PAGE_SIZE) : jams
  return {
    items: items.map(j => formatJam(j, requesterId)),
    nextCursor: hasMore ? items[items.length - 1].id : null
  }
}

export async function getJam(app: FastifyInstance, slug: string, requesterId?: string) {
  const jam = await app.prisma.jam.findUnique({
    where: { slug },
    select: { ...jamSelect, theme: true }
  })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status === 'DRAFT' && jam.organizer.id !== requesterId) throw new Error('JAM_NOT_FOUND')
  return formatJam(jam, requesterId)
}

export async function updateJam(
  app: FastifyInstance,
  slug: string,
  organizerId: string,
  input: UpdateJamInput
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.organizerId !== organizerId) throw new Error('FORBIDDEN')
  if (jam.status !== 'DRAFT') throw new Error('JAM_ALREADY_PUBLISHED')

  const { tags, ...rest } = input
  const data: any = { ...rest }

  if (tags) {
    data.tags = { deleteMany: {}, create: tags.map(tag => ({ tag })) }
  }

  const updated = await app.prisma.jam.update({
    where: { slug },
    data,
    select: { ...jamSelect, theme: true }
  })

  return formatJam(updated, organizerId)
}

export async function deleteJam(app: FastifyInstance, slug: string, organizerId: string) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.organizerId !== organizerId) throw new Error('FORBIDDEN')
  if (jam.status !== 'DRAFT') throw new Error('JAM_ALREADY_PUBLISHED')
  await app.prisma.jam.delete({ where: { slug } })
}

export async function publishJam(app: FastifyInstance, slug: string, organizerId: string) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.organizerId !== organizerId) throw new Error('FORBIDDEN')
  if (jam.status !== 'DRAFT') throw new Error('JAM_ALREADY_PUBLISHED')

  const updated = await app.prisma.jam.update({
    where: { slug },
    data: { status: 'OPEN' },
    select: { ...jamSelect, theme: true }
  })

  // Schedule automatic transitions — best-effort. The jam is already OPEN in the
  // DB, so a scheduling hiccup (Redis/BullMQ) must not make publish appear to fail.
  try {
    await scheduleJamTransition('reveal-theme', jam.id, jam.startAt)
    await scheduleJamTransition('open-voting', jam.id, jam.submissionsEndAt)
    await scheduleJamTransition('close-jam', jam.id, jam.votingEndAt)
  } catch (err) {
    app.log.error({ err, jamId: jam.id }, 'Failed to schedule jam transitions')
  }

  return formatJam(updated, organizerId)
}

export async function cancelJam(app: FastifyInstance, slug: string, organizerId: string) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.organizerId !== organizerId) throw new Error('FORBIDDEN')
  if (jam.status === 'CLOSED' || jam.status === 'DRAFT') throw new Error('JAM_CANNOT_CANCEL')

  // Remove scheduled BullMQ jobs
  await Promise.allSettled([
    jamQueue.remove(jamJobId('reveal-theme', jam.id)),
    jamQueue.remove(jamJobId('open-voting', jam.id)),
    jamQueue.remove(jamJobId('close-jam', jam.id))
  ])

  const updated = await app.prisma.jam.update({
    where: { slug },
    data: { status: 'CLOSED' },
    select: { ...jamSelect, theme: true }
  })

  return formatJam(updated, organizerId)
}

// Forward-only transitions the organizer may trigger manually, independent of the
// background worker (covers cases where Redis/BullMQ timing fails or for testing).
const NEXT_STATUS: Record<string, string> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'VOTING',
  VOTING: 'CLOSED'
}

// The scheduled worker job that becomes redundant once a phase is forced.
const REDUNDANT_JOB: Record<string, JamJobData['type']> = {
  IN_PROGRESS: 'reveal-theme',
  VOTING: 'open-voting',
  CLOSED: 'close-jam'
}

export async function transitionJam(
  app: FastifyInstance,
  slug: string,
  organizerId: string,
  target?: string
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.organizerId !== organizerId) throw new Error('FORBIDDEN')

  const next = NEXT_STATUS[jam.status]
  if (!next) throw new Error('INVALID_TRANSITION')
  if (target && target !== next) throw new Error('INVALID_TRANSITION')

  const data: any = { status: next }
  if (next === 'IN_PROGRESS') data.themeRevealed = true

  const updated = await app.prisma.jam.update({
    where: { id: jam.id },
    data,
    select: { ...jamSelect, theme: true }
  })

  // Drop the now-redundant scheduled job so it doesn't fire again later.
  const jobType = REDUNDANT_JOB[next]
  if (jobType) await jamQueue.remove(jamJobId(jobType, jam.id)).catch(() => {})

  // Mirror the worker's participant notifications.
  const participantIds = (await app.prisma.jamParticipation.findMany({
    where: { jamId: jam.id },
    select: { userId: true }
  })).map(r => r.userId)

  if (next === 'VOTING') {
    await notifyMany(app.prisma, participantIds, {
      type: 'JAM_VOTING_OPEN', jamId: jam.id, jamSlug: jam.slug, jamTitle: jam.title
    }).catch(() => null)
  } else if (next === 'CLOSED') {
    const allIds = [...new Set([...participantIds, jam.organizerId])]
    await notifyMany(app.prisma, allIds, {
      type: 'JAM_RESULTS_PUBLISHED', jamId: jam.id, jamSlug: jam.slug, jamTitle: jam.title
    }).catch(() => null)
  } else {
    await notifyMany(app.prisma, participantIds, {
      type: 'JAM_STATUS_CHANGED', jamId: jam.id, jamSlug: jam.slug, jamTitle: jam.title, newStatus: next
    }).catch(() => null)
  }

  return formatJam(updated, organizerId)
}

export async function uploadCover(
  app: FastifyInstance,
  slug: string,
  organizerId: string,
  file: { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> },
  position = 50
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.organizerId !== organizerId) throw new Error('FORBIDDEN')
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) throw new Error('INVALID_FILE_TYPE')

  const buffer = await file.toBuffer()
  if (buffer.length > MAX_COVER_SIZE) throw new Error('FILE_TOO_LARGE')

  if (jam.coverUrl) {
    // strip any query (?v=, &pos=) before deriving the storage key
    const key = jam.coverUrl.split('?')[0].split('/').slice(-2).join('/')
    await deleteFile(key).catch(() => null)
  }

  const ext = file.filename.split('.').pop() ?? 'jpg'
  const url = await uploadFile(`covers/${jam.id}.${ext}`, buffer, file.mimetype)
  // ?v= busts the cache; &pos= stores the vertical focal point (0-100) so the
  // chosen part of the image is shown everywhere without being cut off.
  const pos = Math.min(100, Math.max(0, Math.round(position)))
  const versioned = `${url}?v=${Date.now()}&pos=${pos}`

  return app.prisma.jam.update({
    where: { slug },
    data: { coverUrl: versioned },
    select: { coverUrl: true }
  })
}
