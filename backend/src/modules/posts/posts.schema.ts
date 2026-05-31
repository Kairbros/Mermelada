import { z } from 'zod'

export const createPostSchema = z.object({
  content: z.string().min(1).max(500),
  jamId:   z.string().optional()
})

export const createCommentSchema = z.object({
  content:  z.string().min(1).max(300),
  parentId: z.string().optional()
})

export type CreatePostInput    = z.infer<typeof createPostSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
