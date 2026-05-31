type PrismaLike = {
  notification: {
    create: (args: any) => Promise<any>
    createMany: (args: any) => Promise<any>
  }
}

export type NotificationPayload =
  | { type: 'NEW_FOLLOWER';             followerId: string; followerUsername: string; followerAvatarUrl: string | null }
  | { type: 'POST_LIKE';                postId: string; likerId: string; likerUsername: string; likerAvatarUrl: string | null }
  | { type: 'POST_COMMENT';             postId: string; commentId: string; commenterId: string; commenterUsername: string; commenterAvatarUrl: string | null; contentPreview: string }
  | { type: 'COMMENT_REPLY';            postId: string; commentId: string; replyId: string; replierId: string; replierUsername: string; replierAvatarUrl: string | null; contentPreview: string }
  | { type: 'JAM_STATUS_CHANGED';       jamId: string; jamSlug: string; jamTitle: string; newStatus: string }
  | { type: 'JAM_SUBMISSION_RECEIVED';  jamId: string; jamSlug: string; jamTitle: string; submitterId: string; submitterUsername: string; submitterAvatarUrl: string | null }
  | { type: 'JAM_VOTING_OPEN';          jamId: string; jamSlug: string; jamTitle: string }
  | { type: 'JAM_RESULTS_PUBLISHED';    jamId: string; jamSlug: string; jamTitle: string }

export async function notify(prisma: PrismaLike, userId: string, payload: NotificationPayload) {
  const { type, ...data } = payload
  await prisma.notification.create({ data: { userId, type, data } })
}

export async function notifyMany(prisma: PrismaLike, userIds: string[], payload: NotificationPayload) {
  if (userIds.length === 0) return
  const { type, ...data } = payload
  await prisma.notification.createMany({
    data: userIds.map(userId => ({ userId, type, data })),
    skipDuplicates: true
  })
}
