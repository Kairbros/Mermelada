'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/contexts/LanguageContext'
import PostCard from '@/components/PostCard'
import JamCard from '@/components/JamCard'
import { UsersIcon, GlobeIcon } from '@/components/Icons'
import type { UserProfile, Post } from '@/types/post'
import type { Jam } from '@/types/jam'

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params)
  const t = useT()
  const { user: me, accessToken } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [postsCursor, setPostsCursor] = useState<string | null>(null)
  const [postsHasMore, setPostsHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [jams, setJams] = useState<Jam[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<'posts' | 'jams'>('posts')
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`users/${username}`).json<UserProfile>(),
      api.get(`users/${username}/posts`).json<{ items: Post[]; nextCursor: string | null }>(),
    ])
      .then(([profileData, postsData]) => {
        setProfile(profileData)
        setPosts(postsData.items)
        setPostsCursor(postsData.nextCursor)
        setPostsHasMore(!!postsData.nextCursor)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [username])

  async function loadMorePosts() {
    if (!postsCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.get(`users/${username}/posts?cursor=${postsCursor}`)
        .json<{ items: Post[]; nextCursor: string | null }>()
      setPosts(prev => [...prev, ...res.items])
      setPostsCursor(res.nextCursor)
      setPostsHasMore(!!res.nextCursor)
    } catch { /* silently fail */ } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!profile || !me || !accessToken || me.username === username) return
    api.get(`users/${me.username}/following`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .json<{ items: { id: string }[] }>()
      .then(({ items }) => {
        setProfile(p => p ? { ...p, isFollowing: items.some(f => f.id === profile.id) } : p)
      })
      .catch(() => {})
  }, [profile?.id, me, accessToken, username])

  useEffect(() => {
    if (tab !== 'jams' || !profile) return
    api.get(`users/${username}/jams`)
      .json<{ items: Jam[] }>()
      .then(res => setJams(res.items))
      .catch(() => {})
  }, [tab, profile, username])

  async function toggleFollow() {
    if (!accessToken || !profile) return
    setFollowLoading(true)
    try {
      if (profile.isFollowing) {
        await api.delete(`users/${username}/follow`, { headers: { Authorization: `Bearer ${accessToken}` } })
        setProfile(p => p ? { ...p, isFollowing: false, _count: { ...p._count, followers: p._count.followers - 1 } } : p)
      } else {
        await api.post(`users/${username}/follow`, { headers: { Authorization: `Bearer ${accessToken}` } })
        setProfile(p => p ? { ...p, isFollowing: true, _count: { ...p._count, followers: p._count.followers + 1 } } : p)
      }
    } catch {
      // silently fail
    } finally {
      setFollowLoading(false)
    }
  }

  const tabLabels: Record<string, string> = {
    posts: t.profile.posts,
    jams: t.nav.jams,
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="h-40 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
        <div className="mt-4 space-y-3">
          <div className="h-6 w-48 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
          <div className="h-4 w-64 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
        </div>
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <UsersIcon className="h-12 w-12 text-gray-400 dark:text-gray-600" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t.profile.notFound}</h1>
        <Link href="/" className="text-violet-500 transition hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300">{t.profile.backHome}</Link>
      </div>
    )
  }

  const isMe = me?.username === username

  return (
    <div className="min-h-screen">
      {/* Banner */}
      <div className={`h-36 w-full ${profile.bannerUrl ? '' : 'bg-violet-900'}`}>
        {profile.bannerUrl && <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />}
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Avatar + actions */}
        <div className="-mt-12 mb-4 flex items-end justify-between">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden border-4 border-white bg-violet-700 text-3xl font-bold text-white dark:border-gray-950">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" />
              : profile.displayName[0]?.toUpperCase()
            }
          </div>
          {!isMe && me && (
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              className={`px-5 py-2 text-sm font-medium transition disabled:opacity-50 ${
                profile.isFollowing
                  ? 'border border-gray-300 text-gray-600 hover:border-red-400 hover:text-red-500 dark:border-gray-700 dark:text-gray-300 dark:hover:border-red-500/50 dark:hover:text-red-400'
                  : 'bg-violet-600 text-white hover:bg-violet-500'
              }`}
            >
              {followLoading ? '…' : profile.isFollowing ? t.profile.unfollow : t.profile.follow}
            </button>
          )}
          {isMe && (
            <Link href="/settings" className="border border-gray-300 px-5 py-2 text-sm text-gray-600 transition hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white">
              {t.profile.editProfile}
            </Link>
          )}
        </div>

        {/* Profile info */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{profile.displayName}</h1>
            {profile.isVerified && <span className="text-sm text-violet-500 dark:text-violet-400">✓</span>}
          </div>
          <p className="text-sm text-gray-500">@{profile.username}</p>
          {profile.bio && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{profile.bio}</p>}

          <div className="mt-3 flex gap-5 text-sm">
            <Link href={`/users/${username}/connections?tab=followers`} className="text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              <span className="font-medium text-gray-900 dark:text-white">{profile._count.followers}</span> {t.profile.followers}
            </Link>
            <Link href={`/users/${username}/connections?tab=following`} className="text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
              <span className="font-medium text-gray-900 dark:text-white">{profile._count.following}</span> {t.profile.following}
            </Link>
            <span className="text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">{posts.length}{postsHasMore ? '+' : ''}</span> {t.profile.posts}
            </span>
          </div>

          {(profile.websiteUrl || profile.githubUrl || profile.twitterUrl || profile.itchUrl) && (
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
              {profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 transition hover:text-violet-500 dark:hover:text-violet-400"> {t.profile.website}</a>}
              {profile.githubUrl && <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-violet-500 dark:hover:text-violet-400">{t.profile.github}</a>}
              {profile.twitterUrl && <a href={profile.twitterUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-violet-500 dark:hover:text-violet-400">{t.profile.twitter}</a>}
              {profile.itchUrl && <a href={profile.itchUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-violet-500 dark:hover:text-violet-400">{t.profile.itch}</a>}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-gray-800">
          {(['posts', 'jams'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`-mb-px border-b-2 px-4 pb-3 text-sm font-medium capitalize transition ${
                tab === tabKey
                  ? 'border-violet-500 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300'
              }`}
            >
              {tabLabels[tabKey]}
            </button>
          ))}
        </div>

        {tab === 'posts' ? (
          posts.length === 0 ? (
            <div className="py-16 text-center text-gray-500">{t.profile.noPosts}</div>
          ) : (
            <div className="space-y-4 pb-12">
              {posts.map(post => <PostCard key={post.id} post={post} />)}
              {postsHasMore && (
                <button
                  onClick={loadMorePosts}
                  disabled={loadingMore}
                  className="mx-auto block border border-gray-300 px-5 py-2 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-white"
                >
                  {loadingMore ? t.profile.loading : t.profile.loadMore}
                </button>
              )}
            </div>
          )
        ) : (
          jams.length === 0 ? (
            <div className="py-16 text-center text-gray-500">{t.profile.noJams}</div>
          ) : (
            <div className="grid gap-5 pb-12 sm:grid-cols-2">
              {jams.map(jam => <JamCard key={jam.id} jam={jam} />)}
            </div>
          )
        )}
      </div>
    </div>
  )
}
