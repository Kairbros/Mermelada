'use client'
import { Suspense, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { LinkIcon, CheckCircleIcon } from '@/components/Icons'
import { useT } from '@/contexts/LanguageContext'

function ResetPasswordForm() {
  const t = useT()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="border border-gray-200 bg-white p-8 shadow-sm text-center dark:border-gray-800 dark:bg-gray-900">
        <LinkIcon className="mx-auto mb-4 h-10 w-10 text-gray-400 dark:text-gray-500" />
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">{t.auth.reset.invalidLink}</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t.auth.reset.invalidLinkDesc}</p>
        <Link href="/forgot-password" className="text-sm text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300">
          {t.auth.reset.requestLink}
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="border border-gray-200 bg-white p-8 shadow-sm text-center dark:border-gray-800 dark:bg-gray-900">
        <CheckCircleIcon className="mx-auto mb-4 h-10 w-10 text-emerald-400" />
        <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">{t.auth.reset.successTitle}</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t.auth.reset.successSubtitle}</p>
        <Link
          href="/login"
          className="inline-block bg-violet-600 px-6 py-2.5 font-semibold text-white transition hover:bg-violet-500 text-sm"
        >
          {t.common.signIn}
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError(t.auth.reset.minLength); return }
    if (password !== confirm) { setError(t.auth.reset.mustMatch); return }
    setLoading(true)
    try {
      await api.post('auth/reset-password', { json: { token, password } })
      setDone(true)
    } catch {
      setError(t.auth.reset.expiredLink)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{t.auth.reset.title}</h1>
      <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">{t.auth.reset.subtitle}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm text-gray-700 dark:text-gray-300">{t.auth.reset.newPassword}</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder-gray-400 transition focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            placeholder={t.auth.reset.newPasswordPlaceholder}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-700 dark:text-gray-300">{t.auth.reset.confirmPassword}</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder-gray-400 transition focus:border-violet-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            placeholder={t.auth.reset.confirmPasswordPlaceholder}
          />
        </div>

        {error && (
          <p className="border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t.auth.reset.submitting : t.auth.reset.submit}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-500">
        <Link href="/login" className="text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300">
          {t.auth.reset.backToSignIn}
        </Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
