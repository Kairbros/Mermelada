'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useT } from '@/contexts/LanguageContext'
import { SearchIcon } from '@/components/Icons'
import type { UserSummary } from '@/types/post'
import type { Jam } from '@/types/jam'

interface SearchResults {
  users: UserSummary[]
  jams: Jam[]
}

function SearchContent() {
  const t = useT()
  const params = useSearchParams()
  const q = params.get('q') ?? ''
  const [results, setResults] = useState<SearchResults>({ users: [], jams: [] })
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'all' | 'users' | 'jams'>('all')

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { setResults({ users: [], jams: [] }); return }
    setLoading(true)
    try {
      const [usersRes, jamsRes] = await Promise.all([
        api.get(`users/search?q=${encodeURIComponent(query)}`).json<{ items: UserSummary[] }>(),
        api.get(`jams?q=${encodeURIComponent(query)}`).json<{ items: Jam[] }>(),
      ])
      setResults({ users: usersRes.items, jams: jamsRes.items })
    } catch {
      setResults({ users: [], jams: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { search(q) }, [q, search])

  const tabLabels: Record<string, string> = {
    all: t.search.all,
    users: t.search.users,
    jams: t.search.jams,
  }

  const showUsers = tab === 'all' || tab === 'users'
  const showJams = tab === 'all' || tab === 'jams'
  const hasResults = results.users.length > 0 || results.jams.length > 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
        {q ? `${t.search.resultsFor} "${q}"` : t.search.title}
      </h1>

      {q && !loading && (
        <p className="mb-6 text-sm text-gray-500">
          {t.search.results(results.users.length + results.jams.length)}
        </p>
      )}

      {q && (
        <div className="mb-6 flex gap-1">
          {(['all', 'users', 'jams'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                tab === tabKey
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {tabLabels[tabKey]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
          ))}
        </div>
      ) : !q ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-gray-500">
          <SearchIcon className="h-10 w-10 text-gray-400 dark:text-gray-600" />
          <p>{t.search.placeholder}</p>
        </div>
      ) : !hasResults ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center text-gray-500">
          <SearchIcon className="h-10 w-10 text-gray-400 dark:text-gray-700" />
          <p>{t.search.noResults} &ldquo;{q}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-8">
          {showUsers && results.users.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{t.search.developers}</h2>
              <div className="space-y-2">
                {results.users.map(u => (
                  <Link
                    key={u.id}
                    href={`/users/${u.username}`}
                    className="flex items-center gap-3 border border-gray-200 bg-white p-4 transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-violet-700 text-sm font-bold text-white">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt={u.displayName} className="h-full w-full object-cover" />
                        : (u.displayName[0]?.toUpperCase() ?? '?')}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 dark:text-white">{u.displayName}</span>
                        {u.isVerified && <span className="text-xs text-violet-500 dark:text-violet-400">✓</span>}
                      </div>
                      <span className="text-sm text-gray-500">@{u.username}</span>
                    </div>
                    <span className="ml-auto text-gray-400 dark:text-gray-600">→</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {showJams && results.jams.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{t.search.jamsSection}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {results.jams.map(jam => (
                  <Link
                    key={jam.id}
                    href={`/jams/${jam.slug}`}
                    className="flex items-center gap-3 border border-gray-200 bg-white p-4 transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-white">{jam.title}</p>
                      <p className="truncate text-sm text-gray-500">{jam.description}</p>
                    </div>
                    <span className="shrink-0 bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">{jam.status}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  )
}
