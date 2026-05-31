'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/contexts/LanguageContext'
import Avatar from '@/components/Avatar'
import { HeartIcon, CommentIcon } from '@/components/Icons'
import type { Post, Comment } from '@/types/post'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface PostCardProps {
  post: Post
  onDelete?: (id: string) => void
  onUpdate?: (post: Post) => void
}

// ─── Reply row ────────────────────────────────────────────────────────────────
function ReplyItem({
  reply, postId, postAuthorId, isPostAuthor, onDelete
}: {
  reply: Comment
  postId: string
  postAuthorId: string
  isPostAuthor: boolean
  onDelete: (id: string) => void
}) {
  const t = useT()
  const { user, accessToken } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const isOwn = user?.id === reply.user.id
  const canDelete = isOwn || isPostAuthor

  async function handleDelete() {
    if (!accessToken) return
    onDelete(reply.id)
    api.delete(`posts/${postId}/comments/${reply.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => {})
    setMenuOpen(false)
  }

  return (
    <div className="group flex items-start gap-2">
      <Link href={`/users/${reply.user.username}`} className="shrink-0">
        <Avatar name={reply.user.displayName} src={reply.user.avatarUrl} size="xs" />
      </Link>
      <div className={`relative flex-1 min-w-0 border px-2.5 py-1.5 ${
        isOwn
          ? 'border-violet-200 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/30'
          : 'border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/60'
      }`}>
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link href={`/users/${reply.user.username}`} className="truncate text-xs font-medium text-gray-900 transition hover:text-violet-500 dark:text-white dark:hover:text-violet-300">
              {reply.user.displayName}
            </Link>
            {isOwn && <span className="shrink-0 label-mono text-[8px] text-violet-500 dark:text-violet-400">{t.post.you}</span>}
            <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-600">{timeAgo(reply.createdAt)}</span>
          </div>
          {canDelete && (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex h-4 w-4 items-center justify-center text-gray-400 opacity-0 transition hover:text-gray-900 group-hover:opacity-100 dark:hover:text-white"
              >
                <span className="text-xs leading-none tracking-widest">···</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-0.5 w-24 border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
                    <button
                      onClick={handleDelete}
                      className="w-full px-3 py-1.5 text-left text-xs text-red-500 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {t.post.delete}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-600 leading-relaxed dark:text-gray-300">{reply.content}</p>
      </div>
    </div>
  )
}

// ─── Comment row ──────────────────────────────────────────────────────────────
function CommentItem({
  comment, postId, postAuthorId, isPostAuthor, onDelete, onReplyAdded, onReplyDeleted
}: {
  comment: Comment
  postId: string
  postAuthorId: string
  isPostAuthor: boolean
  onDelete: (id: string) => void
  onReplyAdded: () => void
  onReplyDeleted: () => void
}) {
  const t = useT()
  const { user, accessToken } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [repliesOpen, setRepliesOpen] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const [replies, setReplies] = useState<Comment[]>(comment.replies ?? [])
  const replyInputRef = useRef<HTMLInputElement>(null)

  const isOwn = user?.id === comment.user.id
  const canDelete = isOwn || isPostAuthor

  useEffect(() => {
    if (replyOpen) replyInputRef.current?.focus()
  }, [replyOpen])

  async function handleDelete() {
    if (!accessToken) return
    onDelete(comment.id)
    api.delete(`posts/${postId}/comments/${comment.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => {})
    setMenuOpen(false)
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken || !replyText.trim() || replying) return
    setReplying(true)
    try {
      const reply = await api.post(`posts/${postId}/comments`, {
        json: { content: replyText.trim(), parentId: comment.id },
        headers: { Authorization: `Bearer ${accessToken}` }
      }).json<Comment>()
      setReplies(prev => [...prev, reply])
      setReplyText('')
      setReplyOpen(false)
      setRepliesOpen(true)
      onReplyAdded()
    } catch {
      // silently fail
    } finally {
      setReplying(false)
    }
  }

  return (
    <div>
      <div className="group flex items-start gap-2.5">
        <Link href={`/users/${comment.user.username}`} className="shrink-0">
          <Avatar name={comment.user.displayName} src={comment.user.avatarUrl} size="sm" />
        </Link>
        <div className={`relative flex-1 min-w-0 border px-3 py-2 ${
          isOwn
            ? 'border-violet-200 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/30'
            : 'border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link href={`/users/${comment.user.username}`} className="truncate text-xs font-medium text-gray-900 transition hover:text-violet-500 dark:text-white dark:hover:text-violet-300">
                {comment.user.displayName}
              </Link>
              {isOwn && <span className="shrink-0 label-mono text-[8px] text-violet-500 dark:text-violet-400">{t.post.you}</span>}
              <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-600">{timeAgo(comment.createdAt)}</span>
            </div>
            {canDelete && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="flex h-5 w-5 items-center justify-center text-gray-400 opacity-0 transition hover:text-gray-900 group-hover:opacity-100 dark:hover:text-white"
                >
                  <span className="text-sm leading-none tracking-widest">···</span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-0.5 w-28 border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
                      <button
                        onClick={handleDelete}
                        className="w-full px-3 py-2 text-left text-xs text-red-500 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        {t.post.delete}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600 leading-relaxed dark:text-gray-300">{comment.content}</p>

          {/* Reply button */}
          {accessToken && (
            <button
              onClick={() => { setReplyOpen(v => !v); setRepliesOpen(true) }}
              className="mt-1 text-[10px] text-gray-400 transition hover:text-violet-500 dark:hover:text-violet-400"
            >
              {t.post.reply}
            </button>
          )}
        </div>
      </div>

      {/* Replies + reply form */}
      {(replies.length > 0 || replyOpen) && (
        <div className="ml-9 mt-1.5 space-y-1.5">
          {/* Toggle replies */}
          {replies.length > 0 && (
            <button
              onClick={() => setRepliesOpen(v => !v)}
              className="text-[10px] text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
            >
              {repliesOpen ? t.post.hideReplies : t.post.viewReplies(replies.length)}
            </button>
          )}

          {repliesOpen && replies.map(r => (
            <ReplyItem
              key={r.id}
              reply={r}
              postId={postId}
              postAuthorId={postAuthorId}
              isPostAuthor={isPostAuthor}
              onDelete={id => { setReplies(prev => prev.filter(x => x.id !== id)); onReplyDeleted() }}
            />
          ))}

          {/* Reply form */}
          {replyOpen && (
            <form onSubmit={submitReply} className="flex items-center gap-2">
              <Avatar name={user?.displayName ?? '?'} src={user?.avatarUrl} size="xs" />
              <input
                ref={replyInputRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={`${t.post.replying} @${comment.user.username}…`}
                maxLength={300}
                className="flex-1 border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 transition focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
              />
              <button
                type="button"
                onClick={() => { setReplyOpen(false); setReplyText('') }}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {t.post.cancelReply}
              </button>
              <button
                type="submit"
                disabled={!replyText.trim() || replying}
                className="bg-violet-500 px-2.5 py-1 text-[10px] font-medium text-white transition hover:bg-violet-600 disabled:opacity-40"
              >
                {replying ? '…' : t.post.postButton}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
export default function PostCard({ post: initial, onDelete, onUpdate }: PostCardProps) {
  const t = useT()
  const { user, accessToken } = useAuth()
  const [post, setPost] = useState(initial)
  const [liking, setLiking] = useState(false)

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [commenting, setCommenting] = useState(false)

  // Post-level menu / edit / delete
  const [postMenuOpen, setPostMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)

  const isAuthor = !!user && user.id === post.user.id
  const isPostAuthor = !!user && user.id === post.user.id

  useEffect(() => {
    if (!commentsOpen || commentsLoaded) return
    api.get(`posts/${post.id}/comments`)
      .json<{ items: Comment[] }>()
      .then(res => { setComments(res.items); setCommentsLoaded(true) })
      .catch(() => { setCommentsLoaded(true) })
  }, [commentsOpen, post.id, commentsLoaded])

  useEffect(() => {
    if (editMode) editRef.current?.focus()
  }, [editMode])

  function openEdit() {
    setEditContent(post.content)
    setEditMode(true)
    setPostMenuOpen(false)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditContent('')
  }

  async function saveEdit() {
    if (!accessToken || !editContent.trim() || saving) return
    setSaving(true)
    try {
      const updated = await api.patch(`posts/${post.id}`, {
        json: { content: editContent.trim() },
        headers: { Authorization: `Bearer ${accessToken}` }
      }).json<Post>()
      setPost(updated)
      onUpdate?.(updated)
      setEditMode(false)
    } catch {
      // keep edit open on error
    } finally {
      setSaving(false)
    }
  }

  function openDeleteConfirm() {
    setPostMenuOpen(false)
    setDeleteConfirm(true)
  }

  async function confirmDelete() {
    if (!accessToken || deleting) return
    setDeleting(true)
    try {
      await api.delete(`posts/${post.id}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      onDelete?.(post.id)
    } catch {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  async function toggleLike() {
    if (!accessToken || liking) return
    const wasLiked = post.liked
    setPost(p => ({ ...p, liked: !wasLiked, _count: { ...p._count, likes: p._count.likes + (wasLiked ? -1 : 1) } }))
    setLiking(true)
    try {
      if (wasLiked) {
        await api.delete(`posts/${post.id}/like`, { headers: { Authorization: `Bearer ${accessToken}` } })
      } else {
        await api.post(`posts/${post.id}/like`, { headers: { Authorization: `Bearer ${accessToken}` } })
      }
    } catch {
      setPost(p => ({ ...p, liked: wasLiked, _count: { ...p._count, likes: p._count.likes + (wasLiked ? 1 : -1) } }))
    } finally {
      setLiking(false)
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken || !newComment.trim() || commenting) return
    setCommenting(true)
    try {
      const comment = await api.post(`posts/${post.id}/comments`, {
        json: { content: newComment.trim() },
        headers: { Authorization: `Bearer ${accessToken}` }
      }).json<Comment>()
      setComments(prev => [...prev, { ...comment, replies: [] }])
      setPost(p => ({ ...p, _count: { ...p._count, comments: p._count.comments + 1 } }))
      setNewComment('')
    } catch {
      // silently fail
    } finally {
      setCommenting(false)
    }
  }

  function handleCommentDelete(commentId: string) {
    const target = comments.find(c => c.id === commentId)
    const removed = 1 + (target?.replies?.length ?? 0)
    setComments(prev => prev.filter(c => c.id !== commentId))
    setPost(p => ({ ...p, _count: { ...p._count, comments: Math.max(0, p._count.comments - removed) } }))
  }

  return (
    <>
      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{t.post.deleteConfirmTitle}</h2>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{t.post.deleteConfirmDesc}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-600 transition hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:text-white"
              >
                {t.post.cancelEdit}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-40"
              >
                {deleting ? t.post.deleting : t.post.deleteConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      <article className="border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <Link href={`/users/${post.user.username}`} className="shrink-0">
              <Avatar name={post.user.displayName} src={post.user.avatarUrl} size="md" />
            </Link>
            <div className="flex-1 min-w-0">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <Link href={`/users/${post.user.username}`} className="text-sm font-medium text-gray-900 transition hover:text-violet-500 dark:text-white dark:hover:text-violet-300">
                    {post.user.displayName}
                  </Link>
                  {post.user.isVerified && <span className="text-violet-500 text-xs">✓</span>}
                  <span className="text-gray-300 text-xs dark:text-gray-600">·</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">@{post.user.username}</span>
                  <span className="text-gray-300 text-xs dark:text-gray-600">·</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(post.createdAt)}</span>
                  {post.createdAt !== post.updatedAt && (
                    <span className="text-xs text-gray-300 dark:text-gray-600">{t.post.edited}</span>
                  )}
                </div>

                {/* Three-dots menu — author only */}
                {isAuthor && !editMode && (
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setPostMenuOpen(v => !v)}
                      className="flex h-7 w-7 items-center justify-center text-gray-400 transition hover:text-gray-700 dark:hover:text-white"
                      title="Options"
                    >
                      <span className="text-base leading-none tracking-widest">···</span>
                    </button>
                    {postMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setPostMenuOpen(false)} />
                        <div className="absolute right-0 top-full z-20 mt-0.5 w-36 border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
                          <button
                            onClick={openEdit}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            {t.post.editPost}
                          </button>
                          <button
                            onClick={openDeleteConfirm}
                            className="w-full px-3 py-2 text-left text-sm text-red-500 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            {t.post.deletePost}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Content — normal or edit mode */}
              {editMode ? (
                <div className="mt-2">
                  <textarea
                    ref={editRef}
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full resize-none border border-violet-400 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-violet-600 dark:bg-gray-800 dark:text-white"
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={`text-xs ${editContent.length > 450 ? 'text-amber-500' : 'text-gray-400'}`}>
                      {editContent.length}/500
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="px-3 py-1 text-xs text-gray-500 transition hover:text-gray-800 disabled:opacity-40 dark:hover:text-white"
                      >
                        {t.post.cancelEdit}
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={!editContent.trim() || saving}
                        className="bg-violet-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-violet-600 disabled:opacity-40"
                      >
                        {saving ? t.post.saving : t.post.saveEdit}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-line dark:text-gray-300">{post.content}</p>
              )}

              {post.images.length > 0 && (
                <div className={`mt-3 grid gap-2 overflow-hidden ${post.images.length > 1 ? 'grid-cols-2' : ''}`}>
                  {post.images.slice(0, 4).map(img => (
                    <img key={img.id} src={img.url} alt="" className="w-full object-contain max-h-96 bg-gray-100 dark:bg-gray-800/40" />
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-5">
                <button
                  onClick={toggleLike}
                  disabled={!accessToken}
                  className={`flex items-center gap-1.5 text-sm transition disabled:opacity-40 ${
                    post.liked ? 'text-rose-500' : 'text-gray-400 hover:text-rose-500 dark:text-gray-500 dark:hover:text-rose-400'
                  }`}
                >
                  <HeartIcon className="h-4 w-4" filled={post.liked} />
                  {post._count.likes > 0 && <span>{post._count.likes}</span>}
                </button>
                <button
                  onClick={() => setCommentsOpen(v => !v)}
                  className={`flex items-center gap-1.5 text-sm transition ${commentsOpen ? 'text-violet-500 dark:text-violet-400' : 'text-gray-400 hover:text-violet-500 dark:text-gray-500 dark:hover:text-violet-400'}`}
                >
                  <CommentIcon className="h-4 w-4" />
                  {post._count.comments > 0 && <span>{post._count.comments}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Comments section */}
        {commentsOpen && (
          <div className="border-t border-gray-100 px-5 pb-4 pt-4 dark:border-gray-800">
            {!commentsLoaded ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-gray-100 dark:bg-gray-800/60" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-2">{t.post.noComments}</p>
                )}
                {comments.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    postId={post.id}
                    postAuthorId={post.user.id}
                    isPostAuthor={isPostAuthor}
                    onDelete={handleCommentDelete}
                    onReplyAdded={() => setPost(p => ({ ...p, _count: { ...p._count, comments: p._count.comments + 1 } }))}
                    onReplyDeleted={() => setPost(p => ({ ...p, _count: { ...p._count, comments: Math.max(0, p._count.comments - 1) } }))}
                  />
                ))}

                {/* New top-level comment form */}
                {accessToken ? (
                  <form onSubmit={handleComment} className="flex items-center gap-2.5 pt-1">
                    <Avatar name={user?.displayName ?? '?'} src={user?.avatarUrl} size="sm" />
                    <input
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder={t.post.addComment}
                      maxLength={300}
                      className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 transition focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-600"
                    />
                    <button
                      type="submit"
                      disabled={!newComment.trim() || commenting}
                      className="bg-violet-500 hover:bg-violet-600 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white transition"
                    >
                      {commenting ? '…' : t.post.postButton}
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-600 text-center pt-1">
                    <Link href="/login" className="text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300">{t.post.signInTo}</Link> {t.post.toComment}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </article>
    </>
  )
}
