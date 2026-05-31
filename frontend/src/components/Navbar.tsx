'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useT } from '@/contexts/LanguageContext'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useState, useEffect, useRef } from 'react'
import Avatar from '@/components/Avatar'
import { SearchIcon, BellIcon, LogoMark, PlusIcon, SunIcon, MoonIcon } from '@/components/Icons'

export default function Navbar() {
  const t = useT()
  const { user, loading, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const { unread } = useNotifications()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const linkClass = (href: string) =>
    `transition text-sm font-medium ${
      pathname === href || pathname.startsWith(href + '/')
        ? 'text-gray-900 dark:text-white'
        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
    }`

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    router.push(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-3 sm:gap-4 sm:px-6">

        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2 text-gray-900 dark:text-white">
          <LogoMark className="h-7 w-7" />
          <span className="hidden text-sm font-bold tracking-tight sm:block">{t.nav.brand}</span>
        </Link>

        {/* Nav links — desktop */}
        <div className="hidden items-center gap-5 md:flex">
          {user && <Link href="/feed" className={linkClass('/feed')}>{t.nav.feed}</Link>}
          <Link href="/jams" className={linkClass('/jams')}>{t.nav.jams}</Link>
          <Link href="/calendar" className={linkClass('/calendar')}>{t.nav.calendar}</Link>
        </div>

        {/* Search — inline desktop */}
        <form onSubmit={handleSearch} className="relative ml-auto hidden max-w-xs flex-1 sm:block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.nav.searchPlaceholder}
            className="w-full border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-violet-500 focus:outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:placeholder-gray-600"
          />
        </form>

        {/* Right actions */}
        {loading ? (
          <div className="ml-auto h-8 w-20 animate-pulse bg-gray-200 dark:bg-gray-800" />
        ) : user ? (
          <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
            {/* Mobile search */}
            <Link href="/search" className="flex h-9 w-9 items-center justify-center text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white sm:hidden">
              <SearchIcon className="h-5 w-5" />
            </Link>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              title={theme === 'dark' ? t.nav.switchLight : t.nav.switchDark}
            >
              {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>

            {/* Bell */}
            <Link href="/notifications" className="relative flex h-9 w-9 items-center justify-center text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white" title={t.nav.notifications}>
              <BellIcon className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center bg-violet-500 px-1 font-mono text-[9px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            {/* Avatar menu */}
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-1.5 px-1.5 py-1 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                <span className="hidden max-w-[7rem] truncate text-sm sm:block">{user.displayName}</span>
                <svg viewBox="0 0 24 24" className="hidden h-3.5 w-3.5 text-gray-400 dark:text-gray-500 sm:block" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <div className="border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.displayName}</p>
                    <p className="font-mono text-[11px] text-gray-500">@{user.username}</p>
                  </div>

                  <p className="label-mono px-4 pb-1 pt-3 text-gray-400 dark:text-gray-600">{t.nav.explore}</p>
                  <DropItem href="/feed" onClick={() => setMenuOpen(false)}>{t.nav.feed}</DropItem>
                  <DropItem href="/jams" onClick={() => setMenuOpen(false)}>{t.nav.browseJams}</DropItem>
                  <DropItem href="/calendar" onClick={() => setMenuOpen(false)}>{t.nav.calendar}</DropItem>

                  <p className="label-mono px-4 pb-1 pt-3 text-gray-400 dark:text-gray-600">{t.nav.createSection}</p>
                  <DropItem href="/jams/new" onClick={() => setMenuOpen(false)}>{t.nav.hostJam}</DropItem>

                  <p className="label-mono px-4 pb-1 pt-3 text-gray-400 dark:text-gray-600">{t.nav.account}</p>
                  <DropItem href={`/users/${user.username}`} onClick={() => setMenuOpen(false)}>{t.nav.yourProfile}</DropItem>
                  <DropItem href="/notifications" onClick={() => setMenuOpen(false)}>
                    <span className="flex w-full items-center justify-between">
                      {t.nav.notifications}
                      {unread > 0 && <span className="bg-violet-500 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{unread}</span>}
                    </span>
                  </DropItem>
                  <DropItem href="/settings" onClick={() => setMenuOpen(false)}>{t.nav.settings}</DropItem>

                  {user.isAdmin && (
                    <>
                      <p className="label-mono px-4 pb-1 pt-3 text-gray-400 dark:text-gray-600">{t.nav.adminSection}</p>
                      <DropItem href="/admin" onClick={() => setMenuOpen(false)}>
                        <span className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400">{t.nav.moderation}</span>
                      </DropItem>
                    </>
                  )}

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                  <button
                    onClick={async () => { setMenuOpen(false); await logout(); router.push('/') }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-500 transition hover:bg-gray-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
                  >
                    {t.nav.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            {/* Mobile search */}
            <Link href="/search" className="flex h-9 w-9 items-center justify-center text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white sm:hidden">
              <SearchIcon className="h-5 w-5" />
            </Link>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              title={theme === 'dark' ? t.nav.switchLight : t.nav.switchDark}
            >
              {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>

            <Link href="/login" className="text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
              {t.nav.signIn}
            </Link>
            <Link href="/register" className="btn-primary">
              {t.nav.register}
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}

function DropItem({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white">
      {children}
    </Link>
  )
}
