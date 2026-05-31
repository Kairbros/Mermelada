import { FastifyInstance } from 'fastify'
import type { CastVoteInput } from './votes.schema'

const voteSelect = {
  id: true, score: true, comment: true, createdAt: true, updatedAt: true,
  submission: { select: { id: true, title: true } },
  voter: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } }
}

// The organizer may vote too, even though they're not a registered participant.
async function assertCanVote(app: FastifyInstance, jam: { id: string; organizerId: string }, voterId: string) {
  if (jam.organizerId === voterId) return
  const participation = await app.prisma.jamParticipation.findUnique({
    where: { userId_jamId: { userId: voterId, jamId: jam.id } }
  })
  if (!participation) throw new Error('NOT_PARTICIPATING')
}

export async function castVote(
  app: FastifyInstance,
  slug: string,
  voterId: string,
  input: CastVoteInput
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'VOTING') throw new Error('VOTING_NOT_OPEN')

  await assertCanVote(app, jam, voterId)

  const submission = await app.prisma.submission.findUnique({ where: { id: input.submissionId } })
  if (!submission || submission.jamId !== jam.id) throw new Error('SUBMISSION_NOT_FOUND')

  // Can't rate your own submission — nor your own team's
  if (submission.userId === voterId) throw new Error('CANNOT_VOTE_OWN')
  if (submission.teamId) {
    const participation = await app.prisma.jamParticipation.findUnique({
      where: { userId_jamId: { userId: voterId, jamId: jam.id } }
    })
    if (participation?.teamId && participation.teamId === submission.teamId) throw new Error('CANNOT_VOTE_OWN')
  }

  // One rating per (voter, submission): create on first vote, update on change.
  return app.prisma.vote.upsert({
    where: { voterId_submissionId: { voterId, submissionId: input.submissionId } },
    create: {
      jamId: jam.id,
      submissionId: input.submissionId,
      voterId,
      score: input.score,
      comment: input.comment
    },
    update: { score: input.score, comment: input.comment },
    select: voteSelect
  })
}

export async function retractVote(
  app: FastifyInstance,
  slug: string,
  voterId: string,
  submissionId: string
) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'VOTING') throw new Error('VOTING_NOT_OPEN')

  await app.prisma.vote.deleteMany({ where: { voterId, submissionId, jamId: jam.id } })
}

// All of the current user's ratings for this jam, keyed client-side by submissionId.
export async function getMyVotes(app: FastifyInstance, slug: string, voterId: string) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')

  const votes = await app.prisma.vote.findMany({
    where: { voterId, jamId: jam.id },
    select: { submissionId: true, score: true, comment: true }
  })
  return { items: votes }
}

export async function getResults(app: FastifyInstance, slug: string) {
  const jam = await app.prisma.jam.findUnique({ where: { slug } })
  if (!jam) throw new Error('JAM_NOT_FOUND')
  if (jam.status !== 'CLOSED') throw new Error('RESULTS_NOT_READY')

  const submissions = await app.prisma.submission.findMany({
    where: { jamId: jam.id },
    select: {
      id: true, title: true, description: true, fileUrl: true, fileSizeBytes: true,
      externalUrl: true, createdAt: true,
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      team: { select: { id: true, name: true } },
      screenshots: { select: { id: true, url: true, order: true }, orderBy: { order: 'asc' as const } },
      votes: { select: { score: true } }
    }
  })

  const ranked = submissions
    .map(s => {
      const voteCount = s.votes.length
      const avgScore = voteCount > 0
        ? s.votes.reduce((sum, v) => sum + v.score, 0) / voteCount
        : 0
      const { votes, ...rest } = s
      return { submission: rest, voteCount, avgScore }
    })
    .sort((a, b) => b.avgScore - a.avgScore || b.voteCount - a.voteCount)
    .map((item, i) => ({ rank: i + 1, ...item }))

  return { items: ranked }
}
