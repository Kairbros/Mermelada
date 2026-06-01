import { FastifyInstance } from 'fastify'
import { uploadFile, uploadStream, deleteFile } from '../../lib/storage'
import { notify } from '../../lib/notifications'
import type { CreateSubmissionInput, UpdateSubmissionInput } from './submissions.schema'

const PAGE_SIZE = 20
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024
const MAX_SCREENSHOTS = 5

const submissionSelect = {
  id: true, title: true, description: true,
  fileUrl: true, fileSizeBytes: true, externalUrl: true,
  createdAt: true, updatedAt: true,
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
  team: { select: { id: true, name: true } },
  screenshots: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' as const } },
  _count: { select: { votes: true } }
}

// A submission may be managed by its creator, or — if it belongs to a team — by
// any current member of that team. Returns the submission or throws.
async function loadManageableSubmission(
  app: FastifyInstance,
  submissionId: string,
  jamId: string,
  userId: string
) {
  const submission = await app.prisma.submission.findUnique({
    where: { id: submissionId },
    include: { screenshots: true }
  })
  if (!submission || submission.jamId !== jamId) throw new Error('SUBMISSION_NOT_FOUND')

  if (submission.userId === userId) return submission

  // Team submission: allow any teammate to manage it.
  if (submission.teamId) {
    const participation = await app.prisma.jamParticipation.findUnique({
      where: { userId_jamId: { userId, jamId } }
    })
    if (participation?.teamId && participation.teamId === submission.teamId) return submission
  }

  throw new Error('FORBIDDEN')
}

export async function createSubmission(
  app: FastifyInstance,
  slug: string,
  userId: string,
  input: CreateSubmissionInput
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'IN_PROGRESS') throw new Error('JAM_NOT_IN_PROGRESS')

  const participation = await app.prisma.jamParticipation.findUnique({
    where: { userId_jamId: { userId, jamId: jam.id } }
  })
  if (!participation) throw new Error('NOT_PARTICIPATING')
  if (jam.teamMode === 'TEAMS_ONLY' && !participation.teamId) throw new Error('TEAM_REQUIRED')

  // One submission per user, and one per team — give a clear error instead of a raw
  // unique-constraint (P2002) when a teammate already submitted for the team.
  const existing = await app.prisma.submission.findFirst({
    where: {
      jamId: jam.id,
      OR: [
        { userId },
        ...(participation.teamId ? [{ teamId: participation.teamId }] : [])
      ]
    }
  })
  if (existing) throw new Error('ALREADY_SUBMITTED')

  const submitter = await app.prisma.user.findUnique({ where: { id: userId }, select: { username: true, avatarUrl: true } })

  const submission = await app.prisma.submission.create({
    data: {
      jamId: jam.id,
      userId,
      teamId: participation.teamId ?? undefined,
      ...input
    },
    select: submissionSelect
  })

  await notify(app.prisma, jam.organizerId, {
    type: 'JAM_SUBMISSION_RECEIVED',
    jamId: jam.id,
    jamSlug: jam.slug,
    jamTitle: jam.title,
    submitterId: userId,
    submitterUsername: submitter!.username,
    submitterAvatarUrl: submitter!.avatarUrl
  }).catch(() => null)

  return submission
}

// Submissions are private until voting opens — only the public phases expose them.
function isPublicPhase(status: string) {
  return status === 'VOTING' || status === 'CLOSED'
}

export async function listSubmissions(
  app: FastifyInstance,
  slug: string,
  cursor?: string,
  viewerId?: string
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status === 'DRAFT' || jam.status === 'OPEN') throw new Error('JAM_NOT_IN_PROGRESS')

  const where: any = { jamId: jam.id }

  // Before voting opens, non-organizers only see their own (or their team's) submission
  if (!isPublicPhase(jam.status) && jam.organizerId !== viewerId) {
    if (!viewerId) return { items: [], nextCursor: null }
    const participation = await app.prisma.jamParticipation.findUnique({
      where: { userId_jamId: { userId: viewerId, jamId: jam.id } }
    })
    where.OR = [{ userId: viewerId }]
    if (participation?.teamId) where.OR.push({ teamId: participation.teamId })
  }

  const rows = await app.prisma.submission.findMany({
    where,
    take: PAGE_SIZE + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'asc' },
    select: submissionSelect
  })

  const hasMore = rows.length > PAGE_SIZE
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null }
}

export async function getSubmission(
  app: FastifyInstance,
  slug: string,
  submissionId: string,
  viewerId?: string
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status === 'DRAFT' || jam.status === 'OPEN') throw new Error('JAM_NOT_IN_PROGRESS')

  const submission = await app.prisma.submission.findFirst({
    where: { id: submissionId, jamId: jam.id },
    select: submissionSelect
  })
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND')

  // Before voting opens, only the owner, a teammate, or the organizer may view it
  if (!isPublicPhase(jam.status) && jam.organizerId !== viewerId && submission.user.id !== viewerId) {
    let isTeammate = false
    if (viewerId && submission.team) {
      const participation = await app.prisma.jamParticipation.findUnique({
        where: { userId_jamId: { userId: viewerId, jamId: jam.id } }
      })
      isTeammate = participation?.teamId === submission.team.id
    }
    if (!isTeammate) throw new Error('SUBMISSION_NOT_FOUND')
  }

  return submission
}

export async function updateSubmission(
  app: FastifyInstance,
  slug: string,
  submissionId: string,
  userId: string,
  input: UpdateSubmissionInput
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'IN_PROGRESS') throw new Error('JAM_NOT_IN_PROGRESS')

  await loadManageableSubmission(app, submissionId, jam.id, userId)

  return app.prisma.submission.update({
    where: { id: submissionId },
    data: input,
    select: submissionSelect
  })
}

export async function deleteSubmission(
  app: FastifyInstance,
  slug: string,
  submissionId: string,
  userId: string
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'IN_PROGRESS') throw new Error('JAM_NOT_IN_PROGRESS')

  const submission = await loadManageableSubmission(app, submissionId, jam.id, userId)

  // Delete files from MinIO
  const deleteOps: Promise<void>[] = []
  if (submission.fileUrl) {
    const key = submission.fileUrl.split('/').slice(-3).join('/')
    deleteOps.push(deleteFile(key).catch(() => null as any))
  }
  for (const ss of submission.screenshots) {
    // screenshot keys have 4 segments: submissions/{id}/screenshots/{file}
    const key = ss.url.split('/').slice(-4).join('/')
    deleteOps.push(deleteFile(key).catch(() => null as any))
  }
  await Promise.allSettled(deleteOps)
  await app.prisma.submission.delete({ where: { id: submissionId } })
}

export async function uploadGameFile(
  app: FastifyInstance,
  slug: string,
  submissionId: string,
  userId: string,
  file: { filename: string; mimetype: string; file: NodeJS.ReadableStream }
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'IN_PROGRESS') throw new Error('JAM_NOT_IN_PROGRESS')

  const submission = await loadManageableSubmission(app, submissionId, jam.id, userId)

  // Remove old file if one exists
  if (submission.fileUrl) {
    const oldKey = submission.fileUrl.split('/').slice(-3).join('/')
    await deleteFile(oldKey).catch(() => null)
  }

  const ext = file.filename.split('.').pop() ?? 'bin'
  const key = `submissions/${submissionId}/game.${ext}`
  const { url, sizeBytes } = await uploadStream(key, file.file, file.mimetype)

  return app.prisma.submission.update({
    where: { id: submissionId },
    data: { fileUrl: url, fileSizeBytes: sizeBytes },
    select: { fileUrl: true, fileSizeBytes: true }
  })
}

export async function deleteScreenshot(
  app: FastifyInstance,
  slug: string,
  submissionId: string,
  screenshotId: string,
  userId: string
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'IN_PROGRESS') throw new Error('JAM_NOT_IN_PROGRESS')

  await loadManageableSubmission(app, submissionId, jam.id, userId)

  const screenshot = await app.prisma.submissionScreenshot.findUnique({ where: { id: screenshotId } })
  if (!screenshot || screenshot.submissionId !== submissionId) throw new Error('SCREENSHOT_NOT_FOUND')

  const key = screenshot.url.split('/').slice(-4).join('/')
  await deleteFile(key).catch(() => null)
  await app.prisma.submissionScreenshot.delete({ where: { id: screenshotId } })
}

export async function addScreenshot(
  app: FastifyInstance,
  slug: string,
  submissionId: string,
  userId: string,
  file: { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'IN_PROGRESS') throw new Error('JAM_NOT_IN_PROGRESS')

  const submission = await loadManageableSubmission(app, submissionId, jam.id, userId)
  if (submission.screenshots.length >= MAX_SCREENSHOTS) throw new Error('TOO_MANY_SCREENSHOTS')
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) throw new Error('INVALID_FILE_TYPE')

  const buffer = await file.toBuffer()
  if (buffer.length > MAX_SCREENSHOT_SIZE) throw new Error('FILE_TOO_LARGE')

  const ext = file.filename.split('.').pop() ?? 'jpg'
  const key = `submissions/${submissionId}/screenshots/${Date.now()}.${ext}`
  const url = await uploadFile(key, buffer, file.mimetype)

  return app.prisma.submissionScreenshot.create({
    data: { submissionId, url, order: submission.screenshots.length }
  })
}
