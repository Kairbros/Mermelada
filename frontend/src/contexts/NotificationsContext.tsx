'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

interface NotificationsContextValue {
  unread: number
  refresh: () => void
  setUnread: (n: number) => void
  decrement: (by?: number) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth()
  const [unread, setUnreadState] = useState(0)

  const refresh = useCallback(() => {
    if (!accessToken) { setUnreadState(0); return }
    api.get('notifications/unread-count', { headers: { Authorization: `Bearer ${accessToken}` } })
      .json<{ count: number }>()
      .then(r => setUnreadState(r.count))
      .catch(() => {})
  }, [accessToken])

  // Poll periodically + whenever auth changes, and when the tab regains focus.
  useEffect(() => {
    if (!accessToken) { setUnreadState(0); return }
    refresh()
    const id = setInterval(refresh, 30_000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [accessToken, refresh])

  const setUnread = useCallback((n: number) => setUnreadState(Math.max(0, n)), [])
  const decrement = useCallback((by = 1) => setUnreadState(n => Math.max(0, n - by)), [])
  const markAllRead = useCallback(() => setUnreadState(0), [])

  return (
    <NotificationsContext.Provider value={{ unread, refresh, setUnread, decrement, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
