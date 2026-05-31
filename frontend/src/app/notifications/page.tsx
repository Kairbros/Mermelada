'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/contexts/LanguageContext'
import { useNotifications } from '@/contexts/NotificationsContext'
import Avatar from '@/components/Avatar'
import {
  BellIcon, HeartIcon, CommentIcon, UserPlusIcon,
  GamepadIcon, PackageIcon, BallotIcon, TrophyIcon,
} from '@/components/Icons'
import type { Translations } from '@/i18n/en'

interface Notification {
  id: string
  type: string
  data: Record<string, string>
  read: boolean
  createdAt: string
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function typeBadge(type: string): { Icon: typeof BellIcon; bg: string } {
  const map: Record<string, { Icon: typeof BellIcon; bg: string }> = {
    NEW_FOLLOWER:             { Icon: UserPlusIcon,  bg: 'bg-violet-600' },
    POST_LIKE:                { Icon: HeartIcon,     bg: 'bg-rose-600' },
    POST_COMMENT:             { Icon: CommentIcon,   bg: 'bg-sky-600' },
    COMMENT_REPLY:            { Icon: CommentIcon,   bg: 'bg-indigo-600' },
    JAM_STATUS_CHANGED:       { Icon: GamepadIcon,   bg: 'bg-violet-600' },
    JAM_SUBMISSION_RECEIVED:  { Icon: PackageIcon,   bg: 'bg-emerald-600' },
    JAM_VOTING_OPEN:          { Icon: BallotIcon,    bg: 'bg-amber-600' },
    JAM_RESULTS_PUBLISHED:    { Icon: TrophyIcon,    bg: 'bg-amber-500' },
  }
  return map[type] ?? { Icon: BellIcon, bg: 'bg-gray-600' }
}

function describe(type: string, data: Record<string, string>, t: Translations) {
  switch (type) {
    case 'NEW_FOLLOWER':
      return {
        actor: { name: data.followerUsername, avatar: data.followerAvatarUrl, username: data.followerUsername },
        message: <>{t.notifications.startedFollowing}</>,
      }
    case 'POST_LIKE':
      return {
        actor: { name: data.likerUsername, avatar: data.likerAvatarUrl, username: data.likerUsername },
        message: <>{t.notifications.likedPost}</>,
      }
    case 'POST_COMMENT':
      return {
        actor: { name: data.commenterUsername, avatar: data.commenterAvatarUrl, username: data.commenterUsername },
        message: data.contentPreview
          ? <>{t.notifications.commented} <span className="text-gray-500 dark:text-gray-300">&ldquo;{data.contentPreview}&rdquo;</span></>
          : <>{t.notifications.commentedOn}</>,
      }
    case 'COMMENT_REPLY':
      return {
        actor: { name: data.replierUsername, avatar: data.replierAvatarUrl, username: data.replierUsername },
        message: data.contentPreview
          ? <>{t.notifications.repliedToComment} <span className="text-gray-500 dark:text-gray-300">&ldquo;{data.contentPreview}&rdquo;</span></>
          : <>{t.notifications.repliedToComment}</>,
      }
    case 'JAM_SUBMISSION_RECEIVED':
      return {
        actor: { name: data.submitterUsername, avatar: data.submitterAvatarUrl, username: data.submitterUsername },
        message: <>{t.notifications.submittedTo} <strong className="text-gray-900 dark:text-white">{data.jamTitle}</strong></>,
      }
    case 'JAM_STATUS_CHANGED':
      return { actor: null, message: <>{t.notifications.jam} <strong className="text-gray-900 dark:text-white">{data.jamTitle}</strong> {t.notifications.jamIsNow} {data.newStatus}</> }
    case 'JAM_VOTING_OPEN':
      return { actor: null, message: <>{t.notifications.votingOpen} <strong className="text-gray-900 dark:text-white">{data.jamTitle}</strong></> }
    case 'JAM_RESULTS_PUBLISHED':
      return { actor: null, message: <>{t.notifications.resultsPublished} <strong className="text-gray-900 dark:text-white">{data.jamTitle}</strong></> }
    default:
      return { actor: null, message: <span>{t.notifications.newNotification}</span> }
  }
}

function notifLink(type: string, data: Record<string, string>) {
  if (type.startsWith('JAM_') && data.jamSlug) return `/jams/${data.jamSlug}`
  if (type === 'NEW_FOLLOWER' && data.followerUsername) return `/users/${data.followerUsername}`
  if ((type === 'POST_LIKE' || type === 'POST_COMMENT' || type === 'COMMENT_REPLY') && data.postId) return `/posts/${data.postId}`
  return null
}

export default function NotificationsPage() {
  const t = useT()
  const { user, accessToken, loading: authLoading } = useAuth()
  const { refresh, setUnread, decrement, markAllRead: ctxMarkAllRead } = useNotifications()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!accessToken) return
    api.get('notifications', { headers: { Authorization: `Bearer ${accessToken}` } })
      .json<{ items: Notification[] }>()
      .then(res => {
        setNotifications(res.items)
        // Sync the shared badge with the real unread count on load.
        setUnread(res.items.filter(n => !n.read).length)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accessToken, setUnread])

  async function markAllRead() {
    if (!accessToken || markingAll) return
    setMarkingAll(true)
    ctxMarkAllRead()
    try {
      await api.post('notifications/read-all', { headers: { Authorization: `Bearer ${accessToken}` } })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch {
      refresh()
    } finally {
      setMarkingAll(false)
    }
  }

  function markRead(id: string) {
    if (!accessToken) return
    const target = notifications.find(n => n.id === id)
    if (!target || target.read) return
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    decrement()
    api.patch(`notifications/${id}/read`, { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => refresh())
  }

  function deleteNotif(id: string) {
    if (!accessToken) return
    const target = notifications.find(n => n.id === id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (target && !target.read) decrement()
    api.delete(`notifications/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => refresh())
  }

  const unread = notifications.filter(n => !n.read).length

  if (authLoading || (!user && !authLoading)) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin border-2 border-violet-500 border-t-transparent" /></div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t.notifications.title}</h1>
          {unread > 0 && <p className="mt-0.5 text-sm text-gray-500">{t.notifications.unread(unread)}</p>}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="px-3 py-1.5 text-sm text-violet-600 transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50 dark:text-violet-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
          >
            {t.notifications.markAllRead}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-gray-200 bg-gray-50 py-20 text-center dark:border-gray-800 dark:bg-gray-900/50">
          <BellIcon className="h-10 w-10 text-gray-400 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400">{t.notifications.empty}</p>
          <p className="text-sm text-gray-400 dark:text-gray-600">{t.notifications.emptySubtitle}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notifications.map(n => {
            const href = notifLink(n.type, n.data)
            const { actor, message } = describe(n.type, n.data, t)
            const badge = typeBadge(n.type)

            const body = (
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="relative shrink-0">
                  <Avatar name={actor?.name ?? '?'} src={actor?.avatar} size="md" />
                  <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${badge.bg} text-white ring-2 ring-white dark:ring-gray-950`}>
                    <badge.Icon className="h-3 w-3" />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-relaxed ${n.read ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
                    {actor?.username && (
                      <Link
                        href={`/users/${actor.username}`}
                        onClick={e => e.stopPropagation()}
                        className="font-semibold text-gray-900 transition hover:text-violet-600 dark:text-white dark:hover:text-violet-300"
                      >
                        {actor.name}
                      </Link>
                    )}{actor?.username ? ' ' : ''}{message}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-600">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            )

            function activate() {
              if (!n.read) markRead(n.id)
              if (href) router.push(href)
            }

            return (
              <div
                key={n.id}
                onClick={activate}
                role={href ? 'link' : undefined}
                className={`group flex items-center gap-2 border px-4 py-3 transition ${href ? 'cursor-pointer' : ''} ${
                  n.read
                    ? 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-900/50'
                    : 'border-violet-500/20 bg-violet-50 dark:bg-violet-500/[0.06]'
                }`}
              >
                {body}

                <div className="flex shrink-0 items-center gap-1">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-violet-500" title="Unread" />}
                  <button
                    onClick={e => { e.stopPropagation(); deleteNotif(n.id) }}
                    className="flex h-7 w-7 items-center justify-center text-gray-400 opacity-0 transition hover:bg-gray-200 hover:text-gray-700 group-hover:opacity-100 dark:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title={t.common.delete}
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
