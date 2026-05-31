import { Queue } from 'bullmq'
import Redis from 'ioredis'

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null
})

export const jamQueue = new Queue('jam', { connection })

export type JamJobData =
  | { type: 'reveal-theme'; jamId: string }
  | { type: 'open-submissions'; jamId: string }
  | { type: 'open-voting'; jamId: string }
  | { type: 'close-jam'; jamId: string }

// BullMQ rejects custom job IDs containing ":", so use "__" as the separator.
export function jamJobId(jobType: JamJobData['type'], jamId: string) {
  return `${jobType}__${jamId}`
}

export async function scheduleJamTransition(
  jobType: JamJobData['type'],
  jamId: string,
  runAt: Date
) {
  const delay = Math.max(runAt.getTime() - Date.now(), 0)
  const jobId = jamJobId(jobType, jamId)
  // Remove any stale job with the same id so re-publishing reschedules cleanly
  await jamQueue.remove(jobId).catch(() => {})
  await jamQueue.add(jobType, { type: jobType, jamId }, {
    delay,
    jobId,
    removeOnComplete: true
  })
}