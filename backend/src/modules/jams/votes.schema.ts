import { z } from 'zod'

export const castVoteSchema = z.object({
  submissionId: z.string(),
  score: z.number().int().min(1).max(10),
  comment: z.string().max(750).optional()
})

export type CastVoteInput = z.infer<typeof castVoteSchema>
