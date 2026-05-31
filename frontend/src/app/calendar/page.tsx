'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useT } from '@/contexts/LanguageContext'
import { CalendarIcon } from '@/components/Icons'
import type { Jam } from '@/types/jam'

const BAR_COLORS = [
  'bg-indigo-500', 'bg-pink-500', 'bg-rose-500', 'bg-amber-500',
  'bg-lime-500', 'bg-emerald-500', 'bg-sky-500', 'bg-purple-500',
  'bg-teal-500', 'bg-orange-500',
]
function barColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return BAR_COLORS[h % BAR_COLORS.length]
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const HEADER_H = 50

export default function CalendarPage() {
  const t = useT()
  const today = new Date()
  const router = useRouter()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear] = useState(today.getFullYear())
  const [jams, setJams] = useState<Jam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`jams/calendar?month=${month}&year=${year}`)
      .json<{ items: Jam[] }>()
      .then(res => setJams(res.items))
      .catch(() => setJams([]))
      .finally(() => setLoading(false))
  }, [month, year])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1)
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const monthEnd = useMemo(() => new Date(year, month, 0, 23, 59, 59), [year, month])

  const bars = useMemo(() => jams.map(j => {
    const start = new Date(j.startAt)
    const end = new Date(j.votingEndAt)
    const startDay = start < monthStart ? 1 : start.getDate()
    const endDay = end > monthEnd ? daysInMonth : end.getDate()
    return {
      jam: j, startDay,
      span: Math.max(1, endDay - startDay + 1),
      clippedLeft: start < monthStart,
      clippedRight: end > monthEnd,
    }
  }), [jams, monthStart, monthEnd, daysInMonth])

  const colPct = 100 / daysInMonth
  const todayCol = (today.getFullYear() === year && today.getMonth() + 1 === month) ? today.getDate() : null
  const monthName = t.calendar.months[month - 1]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-violet-400" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t.calendar.title}</h1>
        </div>
        <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start sm:gap-2">
          <button onClick={prevMonth} className="btn-ghost py-1.5" aria-label="Previous month">←</button>
          <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{monthName} {year}</span>
          <button onClick={nextMonth} className="btn-ghost py-1.5" aria-label="Next month">→</button>
        </div>
      </div>

      {loading ? (
        <div className="h-80 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800/60" />
      ) : bars.length === 0 ? (
        <div className="border border-gray-200 bg-gray-50 py-20 text-center font-mono text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-600">
          {t.calendar.noJams(monthName, year)}
        </div>
      ) : (
        <>
          {/* ── Desktop timeline ── */}
          <div className="hidden overflow-hidden border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50 md:block">
            <div className="relative w-full">
              <div className="flex border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = new Date(year, month - 1, i + 1)
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const isToday = todayCol === i + 1
                  return (
                    <div key={i} style={{ width: `${colPct}%` }} className={`shrink-0 px-0.5 py-2 text-center ${weekend ? 'bg-gray-100 dark:bg-gray-800/40' : ''}`}>
                      <div className={`font-mono text-xs font-semibold ${isToday ? 'text-violet-500' : 'text-gray-700 dark:text-gray-300'}`}>{i + 1}</div>
                      <div className="font-mono text-[9px] uppercase text-gray-400 dark:text-gray-600">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]}</div>
                    </div>
                  )
                })}
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex" style={{ top: HEADER_H }}>
                {Array.from({ length: daysInMonth }, (_, i) => (
                  <div key={i} style={{ width: `${colPct}%` }} className="h-full shrink-0 border-r border-gray-200 dark:border-gray-800/50" />
                ))}
              </div>

              <div className="relative py-2">
                {bars.map(({ jam, startDay, span }) => (
                  <div key={jam.id} className="relative h-9">
                    <button
                      onClick={() => router.push(`/jams/${jam.slug}`)}
                      style={{
                        left: `calc(${(startDay - 1) * colPct}% + 2px)`,
                        width: `calc(${span * colPct}% - 4px)`,
                      }}
                      className={`group absolute top-1 flex h-7 items-center gap-2 overflow-hidden px-2 text-left text-white transition hover:z-10 hover:brightness-110 ${barColor(jam.id)}`}
                      title={`${jam.title} — ${jam._count.participants} joined`}
                    >
                      <span className="truncate text-xs font-semibold">{jam.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-white/70">{jam._count.participants}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-2 hidden text-right font-mono text-[11px] text-gray-400 dark:text-gray-600 md:block">{t.calendar.clickToOpen}</p>

          {/* ── Mobile agenda ── */}
          <div className="space-y-2 md:hidden">
            {[...jams]
              .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
              .map(jam => (
                <button
                  key={jam.id}
                  onClick={() => router.push(`/jams/${jam.slug}`)}
                  className="card-hover flex w-full items-stretch gap-0 overflow-hidden border border-gray-200 bg-white text-left dark:border-gray-800 dark:bg-gray-900"
                >
                  <span className={`w-1 shrink-0 ${barColor(jam.id)}`} />
                  <div className="min-w-0 flex-1 px-3 py-3">
                    <p className="truncate font-semibold text-gray-900 dark:text-white">{jam.title}</p>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-gray-500">
                      <span>{fmt(jam.startAt)} → {fmt(jam.votingEndAt)}</span>
                      <span className="text-gray-300 dark:text-gray-700">·</span>
                      <span>{jam._count.participants} joined</span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
