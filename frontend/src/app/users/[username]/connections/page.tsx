'use client'
import { Suspense, useEffect, useState, use, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useT } from '@/contexts/LanguageContext'
import Avatar from '@/components/Avatar'
import type { UserSummary } from '@/types/post'

type Tab = 'followers' | 'following'

function ConnectionsContent({ username }: { username: string }) {
  const t = useT()
  const searchParams = useSearchParams()
  const initialTab: Tab = searchParams.get('tab') === 'following' ? 'following' : 'followers'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const tabLabels: Record<Tab, string> = {
    followers: t.connections.followers,
    following: t.connections.following,
  }

  const load = useCallback(async (which: Tab) => {
    setLoading(true)
    setNotFound(false)
    try {
      const res = await api.get(`users/${username}/${which}`)
        .json<{ items: UserSummary[]; nextCursor: string | null }>()
      setUsers(res.items)
      setCursor(res.nextCursor)
      setHasMore(!!res.nextCursor)
    } catch {
      setNotFound(true)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => { load(tab) }, [tab, load])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.get(`users/${username}/${tab}?cursor=${cursor}`)
        .json<{ items: UserSummary[]; nextCursor: string | null }>()
      setUsers(prev => [...prev, ...res.items])
      setCursor(res.nextCursor)
      setHasMore(!!res.nextCursor)
    } catch { /* silently fail */ } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/users/${username}`} className="text-sm text-gray-500 transition hover:text-gray-700 dark:hover:text-gray-300">← @{username}</Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {(['followers', 'following'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`pb-3 px-4 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              tab === tabKey
                ? 'border-violet-500 text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300'
            }`}
          >
            {tabLabels[tabKey]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
          ))}
        </div>
      ) : notFound ? (
        <div className="py-16 text-center text-gray-500">{t.connections.notFound}</div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          {tab === 'followers' ? t.connections.noFollowers : t.connections.notFollowing}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Link
              key={u.id}
              href={`/users/${u.username}`}
              className="flex items-center gap-3 border border-gray-200 bg-white p-3.5 transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
            >
              <Avatar name={u.displayName} src={u.avatarUrl} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-900 dark:text-white truncate">{u.displayName}</span>
                  {u.isVerified && <span className="text-violet-500 dark:text-violet-400 text-xs">✓</span>}
                </div>
                <span className="text-sm text-gray-500">@{u.username}</span>
              </div>
              <span className="ml-auto text-gray-400 dark:text-gray-600">→</span>
            </Link>
          ))}
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto block border border-gray-300 px-5 py-2 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-white"
            >
              {loadingMore ? t.connections.loading : t.connections.loadMore}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConnectionsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params)
  return (
    <Suspense>
      <ConnectionsContent username={username} />
    </Suspense>
  )
}
