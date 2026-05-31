'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, parseApiError } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/contexts/LanguageContext'
import PostCard from '@/components/PostCard'
import Avatar from '@/components/Avatar'
import { ImageIcon, UsersIcon } from '@/components/Icons'
import type { Post, PostImage } from '@/types/post'

const MAX_IMAGES = 4
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

export default function FeedPage() {
  const t = useT()
  const { user, accessToken, loading: authLoading } = useAuth()
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [content, setContent] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [composerError, setComposerError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!accessToken) return
    api.get('posts/feed', { headers: { Authorization: `Bearer ${accessToken}` } })
      .json<{ items: Post[] }>()
      .then(res => setPosts(res.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accessToken])

  useEffect(() => () => { previews.forEach(URL.revokeObjectURL) }, [previews])

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length === 0) return
    const badType = picked.find(f => !ALLOWED_MIME.includes(f.type))
    if (badType) {
      setComposerError(t.feed.errorFormat(badType.name))
      e.target.value = ''
      return
    }
    const oversized = picked.filter(f => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) {
      setComposerError(t.feed.errorSize(oversized.map(f => f.name).join(', ')))
      e.target.value = ''
      return
    }
    setComposerError(null)
    const next = [...images, ...picked].slice(0, MAX_IMAGES)
    setImages(next)
    setPreviews(prev => {
      prev.forEach(URL.revokeObjectURL)
      return next.map(f => URL.createObjectURL(f))
    })
    e.target.value = ''
  }

  function removeImage(i: number) {
    const next = images.filter((_, idx) => idx !== i)
    setImages(next)
    setPreviews(prev => {
      prev.forEach(URL.revokeObjectURL)
      return next.map(f => URL.createObjectURL(f))
    })
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || !accessToken || posting) return
    setPosting(true)
    setComposerError(null)

    let post: Post
    try {
      post = await api.post('posts', {
        json: { content: content.trim() },
        headers: { Authorization: `Bearer ${accessToken}` }
      }).json<Post>()
    } catch (err: unknown) {
      setComposerError(await parseApiError(err, t.feed.errorPublish))
      setPosting(false)
      return
    }

    const pendingImages = images
    setContent('')
    previews.forEach(URL.revokeObjectURL)
    setImages([])
    setPreviews([])

    let uploaded: PostImage[] = []
    if (pendingImages.length > 0) {
      try {
        const formData = new FormData()
        pendingImages.forEach(f => formData.append('file', f))
        uploaded = await api.post(`posts/${post.id}/images`, {
          body: formData,
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: false,
        }).json<PostImage[]>()
      } catch (err: unknown) {
        const msg = await parseApiError(err, t.feed.errorImages)
        setComposerError(msg)
      }
    }

    setPosts(prev => [{ ...post, images: uploaded, liked: false }, ...prev])
    setPosting(false)
  }

  if (authLoading || (!user && !authLoading)) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-xl font-semibold text-gray-900 dark:text-white">{t.feed.title}</h1>

      {/* Composer */}
      <form onSubmit={handlePost} className="mb-6 border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-3">
          <Avatar name={user?.displayName ?? '?'} src={user?.avatarUrl} size="md" />
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={t.feed.placeholder}
              rows={3}
              maxLength={500}
              className="w-full resize-none border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />

            {previews.length > 0 && (
              <div className={`mt-2 grid gap-2 ${previews.length > 1 ? 'grid-cols-2' : ''}`}>
                {previews.map((src, i) => (
                  <div key={src} className="relative">
                    <img src={src} alt="" className="w-full object-contain max-h-64 bg-gray-100 dark:bg-gray-800/40" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center bg-black/60 text-white hover:bg-black/80 transition"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {composerError && <p className="mt-2 text-xs text-red-400">{composerError}</p>}

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={images.length >= MAX_IMAGES}
                  className="flex items-center gap-1 text-sm text-gray-400 transition hover:text-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-500 dark:hover:text-violet-400"
                >
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-xs">{images.length > 0 ? `${images.length}/${MAX_IMAGES}` : t.feed.photo}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onPickImages}
                />
                <span className={`text-xs ${content.length > 450 ? 'text-amber-500' : 'text-gray-600'}`}>
                  {content.length}/500
                </span>
              </div>
              <button
                type="submit"
                disabled={!content.trim() || posting}
                className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {posting ? t.feed.posting : t.feed.post}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Posts */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse bg-gray-200 dark:bg-gray-800/60" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-gray-200 bg-gray-50 py-20 text-center dark:border-gray-800 dark:bg-gray-900/50">
          <UsersIcon className="h-10 w-10 text-gray-600" />
          <p className="text-gray-400">{t.feed.emptyTitle}</p>
          <p className="text-sm text-gray-500">{t.feed.emptySubtitle}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={id => setPosts(prev => prev.filter(p => p.id !== id))}
              onUpdate={updated => setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
