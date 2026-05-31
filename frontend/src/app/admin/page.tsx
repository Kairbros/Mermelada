'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/contexts/LanguageContext'
import Avatar from '@/components/Avatar'
import type { Post } from '@/types/post'

interface Stats { users: number; posts: number; comments: number; jams: number }
interface AdminComment {
  id: string
  content: string
  createdAt: string
  user: { id: string; username: string; displayName: string; avatarUrl?: string | null; isVerified: boolean }
  post: { id: string }
}

type Tab = 'posts' | 'comments'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminPage() {
  const t = useT()
  const { user, accessToken, loading: authLoading } = useAuth()
  const router = useRouter()

  const [stats, setStats] = useState<Stats | null>(null)
  const [tab, setTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<AdminComment[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<{ kind: Tab; id: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined

  // Gate: redirect non-admins away.
  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (!user.isAdmin) { router.replace('/'); return }
  }, [authLoading, user, router])

  const loadStats = useCallback(() => {
    if (!accessToken) return
    api.get('admin/stats', { headers: { Authorization: `Bearer ${accessToken}` } })
      .json<Stats>().then(setStats).catch(() => {})
  }, [accessToken])

  const loadList = useCallback(() => {
    if (!accessToken) return
    setLoading(true)
    const path = tab === 'posts' ? 'admin/posts' : 'admin/comments'
    api.get(path, { headers: { Authorization: `Bearer ${accessToken}` } })
      .json<{ items: Post[] | AdminComment[] }>()
      .then(res => {
        if (tab === 'posts') setPosts(res.items as Post[])
        else setComments(res.items as AdminComment[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accessToken, tab])

  useEffect(() => { if (user?.isAdmin) loadStats() }, [user?.isAdmin, loadStats])
  useEffect(() => { if (user?.isAdmin) loadList() }, [user?.isAdmin, loadList])

  async function confirmDelete() {
    if (!confirm || !accessToken) return
    setDeleting(true)
    try {
      await api.delete(`admin/${confirm.kind}/${confirm.id}`, { headers })
      if (confirm.kind === 'posts') setPosts(prev => prev.filter(p => p.id !== confirm.id))
      else setComments(prev => prev.filter(c => c.id !== confirm.id))
      setStats(s => s ? { ...s, [confirm.kind]: Math.max(0, s[confirm.kind] - 1) } : s)
      setConfirm(null)
    } catch { /* keep dialog open on failure */ } finally { setDeleting(false) }
  }

  if (authLoading || !user?.isAdmin) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'posts', label: t.admin.posts, count: stats?.posts },
    { id: 'comments', label: t.admin.comments, count: stats?.comments },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="rounded-md bg-rose-500/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-rose-500 dark:text-rose-400">{t.admin.badge}</span>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t.admin.title}</h1>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t.admin.statUsers} value={stats?.users} />
        <StatCard label={t.admin.statPosts} value={stats?.posts} />
        <StatCard label={t.admin.statComments} value={stats?.comments} />
        <StatCard label={t.admin.statJams} value={stats?.jams} />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`-mb-px border-b-2 px-4 pb-3 text-sm font-medium transition ${
              tab === tb.id
                ? 'border-violet-500 text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {tb.label}{typeof tb.count === 'number' ? ` (${tb.count})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800/60" />)}
        </div>
      ) : tab === 'posts' ? (
        posts.length === 0 ? <Empty label={t.admin.noPosts} /> : (
          <div className="space-y-3">
            {posts.map(p => (
              <div key={p.id} className="border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar name={p.user.displayName} src={p.user.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/users/${p.user.username}`} className="block truncate text-sm font-medium text-gray-900 hover:text-violet-500 dark:text-white">{p.user.displayName}</Link>
                        <span className="text-xs text-gray-400">@{p.user.username} · {timeAgo(p.createdAt)}</span>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{p.content}</p>
                    {p.images.length > 0 && <p className="mt-1 text-xs text-gray-400">{p.images.length} image{p.images.length !== 1 ? 's' : ''} · {p._count.likes} likes · {p._count.comments} comments</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link href={`/posts/${p.id}`} className="text-xs text-gray-400 hover:text-violet-500 transition">{t.admin.view}</Link>
                    <button onClick={() => setConfirm({ kind: 'posts', id: p.id })}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-red-500 transition hover:border-red-500/50 hover:bg-red-500/5 dark:border-gray-700">
                      {t.admin.delete}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        comments.length === 0 ? <Empty label={t.admin.noComments} /> : (
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Avatar name={c.user.displayName} src={c.user.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/users/${c.user.username}`} className="block truncate text-sm font-medium text-gray-900 hover:text-violet-500 dark:text-white">{c.user.displayName}</Link>
                        <span className="text-xs text-gray-400">@{c.user.username} · {timeAgo(c.createdAt)}</span>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-gray-300">{c.content}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link href={`/posts/${c.post.id}`} className="text-xs text-gray-400 hover:text-violet-500 transition">{t.admin.viewPost}</Link>
                    <button onClick={() => setConfirm({ kind: 'comments', id: c.id })}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-red-500 transition hover:border-red-500/50 hover:bg-red-500/5 dark:border-gray-700">
                      {t.admin.delete}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Delete confirmation */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{t.admin.confirmTitle}</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{t.admin.confirmDesc}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 transition hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:text-white">
                {t.admin.cancel}
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-40">
                {deleting ? t.admin.deleting : t.admin.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <div className="border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? '—'}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="border border-gray-200 bg-gray-50 py-16 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900/50">{label}</div>
}
