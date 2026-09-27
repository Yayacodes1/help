'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ClipboardPaste, Download, Loader2, X } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { addDays, rankingMonthRange } from '@/lib/campaign'
import { shiftYearMonth } from '@/lib/biweekly'
import { formatNumber } from '@/lib/format'
import type { DailyDownloadsRow, SheetRow } from '@/lib/analytics'
import { saveDailyDownloads } from '@/app/actions/downloads'

const IG = '#E1306C'
const TT = '#0F766E'
const CREATOR = '#6366F1'
const REPOSTER = '#F59E0B'
const DOWNLOADS = '#94A3B8'

type Tab = 'day' | 'person' | 'impact'
type RoleView = 'all' | 'creator' | 'reposter'

type DayAgg = {
  ttVideos: number
  igVideos: number
  creatorVideos: number
  reposterVideos: number
  ttViews: number
  igViews: number
  creatorViews: number
  reposterViews: number
  views: number
  videos: number
}

type PersonAgg = {
  id: number
  name: string
  role: 'creator' | 'reposter'
  ttVideos: number
  igVideos: number
  ttViews: number
  igViews: number
  views: number
  videos: number
  byDate: Map<string, { views: number; videos: number }>
}

function emptyDay(): DayAgg {
  return {
    ttVideos: 0,
    igVideos: 0,
    creatorVideos: 0,
    reposterVideos: 0,
    ttViews: 0,
    igViews: 0,
    creatorViews: 0,
    reposterViews: 0,
    views: 0,
    videos: 0,
  }
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  if (!from || !to || from > to) return out
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function monthName(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}

function strengthLabel(r: number | null): { text: string; className: string } {
  if (r == null) return { text: 'Not enough data', className: 'text-muted-foreground' }
  const a = Math.abs(r)
  const dir = r >= 0 ? '' : ' (opposite)'
  if (a >= 0.6) return { text: `Strong${dir}`, className: r >= 0 ? 'text-emerald-600' : 'text-red-600' }
  if (a >= 0.3) return { text: `Moderate${dir}`, className: r >= 0 ? 'text-emerald-500' : 'text-red-500' }
  return { text: 'Weak / none', className: 'text-muted-foreground' }
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadFile(name: string, headers: string[], lines: Array<Array<string | number>>) {
  const text = [headers, ...lines].map((l) => l.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Accepts lines like `2026-09-01, 120` or `09/01/2026\t120`. */
function parsePastedDownloads(text: string): Array<{ date: string; downloads: number }> {
  const out: Array<{ date: string; downloads: number }> = []
  for (const line of text.split(/\r?\n/)) {
    const iso = line.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\D+([\d,.\s]+)/)
    const us = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\D+([\d,.\s]+)/)
    let date = ''
    let raw = ''
    if (iso) {
      date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
      raw = iso[4]
    } else if (us) {
      date = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
      raw = us[4]
    } else continue
    const n = Number(raw.replace(/[,\s]/g, ''))
    if (Number.isFinite(n)) out.push({ date, downloads: Math.round(n) })
  }
  return out
}

export function AnalyticsSheet({
  rows,
  downloads,
  from: serverFrom,
  to: serverTo,
  today,
  projectId,
  projects,
}: {
  rows: SheetRow[]
  downloads: DailyDownloadsRow[]
  from: string
  to: string
  today: string
  projectId: number | null
  projects: Array<{ id: number; name: string }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [savePending, startSave] = useTransition()
  const [tab, setTab] = useState<Tab>('day')
  const [roleView, setRoleView] = useState<RoleView>('all')
  const [from, setFrom] = useState(serverFrom)
  const [to, setTo] = useState(serverTo)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const serverKey = `${serverFrom}|${serverTo}|${projectId ?? ''}`
  const [syncedKey, setSyncedKey] = useState(serverKey)
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey)
    setFrom(serverFrom)
    setTo(serverTo)
    setDrafts({})
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function push(patch: { from?: string; to?: string; project?: number | 'all'; close?: boolean }) {
    const params = new URLSearchParams(window.location.search)
    params.set('panel', 'analytics')
    if (patch.close) params.delete('aSheet')
    else params.set('aSheet', '1')
    params.set('aFrom', patch.from ?? from)
    params.set('aTo', patch.to ?? to)
    params.set('aProject', String(patch.project ?? projectId ?? 'all'))
    params.delete('aCreator')
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') push({ close: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function selectDay(day: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return
    push({ from: day, to: day })
  }

  function selectMonth(ym: string) {
    if (!/^\d{4}-\d{2}$/.test(ym)) return
    const { start, end } = rankingMonthRange(ym, today)
    push({ from: start, to: end })
  }

  const dates = useMemo(() => eachDate(serverFrom, serverTo), [serverFrom, serverTo])
  const singleDay = serverFrom === serverTo ? serverFrom : ''
  const stepAnchor = singleDay || (serverTo > today ? today : serverTo)
  const currentMonth = today.slice(0, 7)
  const lastMonth = shiftYearMonth(currentMonth, -1)

  const downloadsByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of downloads) m.set(d.date, d.downloads)
    return m
  }, [downloads])

  const { byDay, totals, people } = useMemo(() => {
    const byDay = new Map<string, DayAgg>()
    for (const d of dates) byDay.set(d, emptyDay())
    const totals = emptyDay()
    const peopleMap = new Map<number, PersonAgg>()
    for (const r of rows) {
      const day = byDay.get(r.date) ?? emptyDay()
      byDay.set(r.date, day)
      const isTt = r.platform === 'tiktok'
      const isRep = r.role === 'reposter'
      for (const agg of [day, totals]) {
        agg.videos += r.videos
        agg.views += r.views
        if (isTt) {
          agg.ttVideos += r.videos
          agg.ttViews += r.views
        } else {
          agg.igVideos += r.videos
          agg.igViews += r.views
        }
        if (isRep) {
          agg.reposterVideos += r.videos
          agg.reposterViews += r.views
        } else {
          agg.creatorVideos += r.videos
          agg.creatorViews += r.views
        }
      }
      let p = peopleMap.get(r.creator_id)
      if (!p) {
        p = {
          id: r.creator_id,
          name: r.creator_name,
          role: r.role,
          ttVideos: 0,
          igVideos: 0,
          ttViews: 0,
          igViews: 0,
          views: 0,
          videos: 0,
          byDate: new Map(),
        }
        peopleMap.set(r.creator_id, p)
      }
      p.views += r.views
      p.videos += r.videos
      if (isTt) {
        p.ttVideos += r.videos
        p.ttViews += r.views
      } else {
        p.igVideos += r.videos
        p.igViews += r.views
      }
      const cell = p.byDate.get(r.date) ?? { views: 0, videos: 0 }
      cell.views += r.views
      cell.videos += r.videos
      p.byDate.set(r.date, cell)
    }
    const people = [...peopleMap.values()].sort(
      (a, b) => b.views - a.views || a.name.localeCompare(b.name),
    )
    return { byDay, totals, people }
  }, [rows, dates])

  const totalDownloads = dates.reduce((sum, d) => sum + (downloadsByDate.get(d) ?? 0), 0)
  const daysWithDownloads = dates.filter((d) => downloadsByDate.has(d))

  const visiblePeople = people.filter((p) => roleView === 'all' || p.role === roleView)
  const visibleTotals = useMemo(() => {
    const t = { ttVideos: 0, igVideos: 0, ttViews: 0, igViews: 0, views: 0, videos: 0 }
    const perDate = new Map<string, number>()
    for (const p of visiblePeople) {
      t.ttVideos += p.ttVideos
      t.igVideos += p.igVideos
      t.ttViews += p.ttViews
      t.igViews += p.igViews
      t.views += p.views
      t.videos += p.videos
      for (const [d, c] of p.byDate) perDate.set(d, (perDate.get(d) ?? 0) + c.views)
    }
    return { ...t, perDate }
  }, [visiblePeople])

  const chartData = dates.map((d) => {
    const a = byDay.get(d) ?? emptyDay()
    return {
      date: d.slice(5),
      fullDate: d,
      views: a.views,
      creatorViews: a.creatorViews,
      reposterViews: a.reposterViews,
      downloads: downloadsByDate.get(d) ?? null,
    }
  })

  const impact = useMemo(() => {
    const ds = daysWithDownloads
    const dl = ds.map((d) => downloadsByDate.get(d) ?? 0)
    const series = (pick: (d: string) => number) => pearson(ds.map(pick), dl)
    const groups = [
      { label: 'All views', r: series((d) => byDay.get(d)?.views ?? 0) },
      { label: 'Creator views', r: series((d) => byDay.get(d)?.creatorViews ?? 0) },
      { label: 'Reposter views', r: series((d) => byDay.get(d)?.reposterViews ?? 0) },
      { label: 'TikTok views', r: series((d) => byDay.get(d)?.ttViews ?? 0) },
      { label: 'Instagram views', r: series((d) => byDay.get(d)?.igViews ?? 0) },
      { label: 'Videos posted', r: series((d) => byDay.get(d)?.videos ?? 0) },
    ]
    const perPerson = people.map((p) => {
      const r = pearson(
        ds.map((d) => p.byDate.get(d)?.views ?? 0),
        dl,
      )
      const posted = ds.filter((d) => (p.byDate.get(d)?.videos ?? 0) > 0)
      const notPosted = ds.filter((d) => (p.byDate.get(d)?.videos ?? 0) === 0)
      const avg = (list: string[]) =>
        list.length === 0
          ? null
          : list.reduce((s, d) => s + (downloadsByDate.get(d) ?? 0), 0) / list.length
      return {
        ...p,
        r,
        share: totals.views > 0 ? p.views / totals.views : 0,
        daysPosted: [...p.byDate.values()].filter((c) => c.videos > 0).length,
        avgPosted: avg(posted),
        avgNotPosted: avg(notPosted),
      }
    })
    perPerson.sort((a, b) => (b.r ?? -2) - (a.r ?? -2) || b.views - a.views)
    return { groups, perPerson }
  }, [daysWithDownloads, downloadsByDate, byDay, people, totals.views])

  const dirtyDates = Object.keys(drafts).filter((d) => {
    const raw = drafts[d].trim()
    const current = downloadsByDate.get(d)
    if (raw === '') return current != null
    return Number(raw) !== current
  })

  function saveDrafts(entries: Array<{ date: string; downloads: number | null }>) {
    if (projectId == null || entries.length === 0) return
    setSaveMsg(null)
    startSave(async () => {
      const res = await saveDailyDownloads(projectId, entries)
      if (res.ok) {
        setDrafts({})
        setPasteText('')
        setPasteOpen(false)
        setSaveMsg(`Saved ${res.saved} day${res.saved === 1 ? '' : 's'}.`)
        router.refresh()
      } else {
        setSaveMsg(res.error)
      }
    })
  }

  const projectName = projects.find((p) => p.id === projectId)?.name ?? 'All projects'
  const projectLabel = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  function exportDaily() {
    const headers = [
      'date',
      'downloads',
      'total_views',
      'tiktok_views',
      'instagram_views',
      'creator_views',
      'reposter_views',
      'total_videos',
      'tiktok_videos',
      'instagram_videos',
      'creator_videos',
      'reposter_videos',
      ...people.map((p) => `${p.name} (${p.role}) views`),
      ...people.map((p) => `${p.name} (${p.role}) videos`),
    ]
    const lines = dates.map((d) => {
      const a = byDay.get(d) ?? emptyDay()
      return [
        d,
        downloadsByDate.get(d) ?? '',
        a.views,
        a.ttViews,
        a.igViews,
        a.creatorViews,
        a.reposterViews,
        a.videos,
        a.ttVideos,
        a.igVideos,
        a.creatorVideos,
        a.reposterVideos,
        ...people.map((p) => p.byDate.get(d)?.views ?? 0),
        ...people.map((p) => p.byDate.get(d)?.videos ?? 0),
      ]
    })
    downloadFile(`daily-sheet-${projectLabel}-${serverFrom}-${serverTo}.csv`, headers, lines)
  }

  function exportLong() {
    const headers = ['date', 'person', 'role', 'platform', 'videos', 'views', 'downloads_that_day']
    const lines = rows.map((r) => [
      r.date,
      r.creator_name,
      r.role,
      r.platform,
      r.videos,
      r.views,
      downloadsByDate.get(r.date) ?? '',
    ])
    downloadFile(`posts-by-person-${projectLabel}-${serverFrom}-${serverTo}.csv`, headers, lines)
  }

  const chip = (active: boolean) =>
    `h-8 rounded-lg border px-3 text-sm font-medium transition-colors ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
    }`
  const th =
    'sticky top-0 z-10 border border-border bg-muted px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap'
  const td = 'border border-border px-2 py-1 text-right tabular-nums whitespace-nowrap'
  const totalTd = `${td} bg-primary/10 font-semibold`
  const n = (v: number) => (v === 0 ? <span className="text-muted-foreground/60">0</span> : formatNumber(v))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Daily sheet · {projectName}</h2>
            <p className="text-xs text-muted-foreground">
              {serverFrom === serverTo ? dayLabel(serverFrom) : `${dayLabel(serverFrom)} → ${dayLabel(serverTo)}`}{' '}
              · views are counted on the day each video was posted
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportDaily}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
              title="One row per day: downloads, views, videos, and each person's views"
            >
              <Download className="size-3.5" />
              Daily CSV
            </button>
            <button
              type="button"
              onClick={exportLong}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
              title="One row per day × person × platform"
            >
              <Download className="size-3.5" />
              Per-person CSV
            </button>
            <button
              type="button"
              onClick={() => push({ close: true })}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent"
              aria-label="Close"
              title="Close (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => push({ project: 'all' })} className={chip(projectId == null)}>
            All projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => push({ project: p.id })}
              className={chip(projectId === p.id)}
            >
              {p.name}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <button type="button" onClick={() => selectMonth(currentMonth)} className={chip(false)}>
            {monthName(currentMonth)}
          </button>
          <button type="button" onClick={() => selectMonth(lastMonth)} className={chip(false)}>
            {monthName(lastMonth)}
          </button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <button
            type="button"
            disabled={isPending}
            onClick={() => selectDay(singleDay ? addDays(singleDay, -1) : stepAnchor)}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="date"
            value={singleDay}
            max={today}
            onChange={(e) => selectDay(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Day"
          />
          <button
            type="button"
            disabled={isPending || (singleDay !== '' && singleDay >= today)}
            onClick={() => selectDay(singleDay ? addDays(singleDay, 1) : stepAnchor)}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-50"
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (from && to && from <= to) push({ from, to })
            }}
          >
            <input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="From"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="To"
            />
            <button type="submit" className="h-8 rounded-lg border border-border px-3 text-sm hover:bg-accent">
              Show
            </button>
          </form>
        </div>
      </header>

      <div className="relative flex-1 overflow-auto px-4 py-3">
        {isPending ? (
          <div className="absolute inset-0 z-30 flex items-start justify-center bg-background/60 pt-24 backdrop-blur-[1px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Loading…
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: 'Total views', value: totals.views },
            { label: 'TikTok views', value: totals.ttViews, color: TT },
            { label: 'Instagram views', value: totals.igViews, color: IG },
            { label: 'Downloads', value: totalDownloads },
            { label: 'TikTok videos', value: totals.ttVideos, color: TT },
            { label: 'Instagram posts', value: totals.igVideos, color: IG },
            { label: 'By creators', value: totals.creatorVideos, color: CREATOR },
            { label: 'By reposters', value: totals.reposterVideos, color: REPOSTER },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums" style={s.color ? { color: s.color } : undefined}>
                {formatNumber(s.value)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 h-72 w-full rounded-lg border border-border p-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="views"
                tick={{ fontSize: 11 }}
                width={60}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              <YAxis
                yAxisId="downloads"
                orientation="right"
                tick={{ fontSize: 11 }}
                width={48}
                tickFormatter={(v) => formatNumber(Number(v))}
              />
              <Tooltip
                formatter={(value, name) =>
                  value == null ? ['—', String(name)] : [formatNumber(Number(value)), String(name)]
                }
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.fullDate as string | undefined
                  return d ? dayLabel(d) : ''
                }}
              />
              <Legend />
              <Bar
                yAxisId="downloads"
                dataKey="downloads"
                name="Downloads"
                fill={DOWNLOADS}
                opacity={0.55}
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="views"
                name="Total views"
                stroke="#0F172A"
                strokeWidth={2.5}
                dot={dates.length <= 31}
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="creatorViews"
                name="Creator views"
                stroke={CREATOR}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="reposterViews"
                name="Reposter views"
                stroke={REPOSTER}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
            {(
              [
                ['day', 'By day'],
                ['person', 'By person'],
                ['impact', 'What drives downloads'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  tab === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'day' ? (
            <>
              {projectId != null ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPasteOpen((v) => !v)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-accent"
                  >
                    <ClipboardPaste className="size-3.5" />
                    Paste downloads
                  </button>
                  {dirtyDates.length > 0 ? (
                    <button
                      type="button"
                      disabled={savePending}
                      onClick={() =>
                        saveDrafts(
                          dirtyDates.map((d) => ({
                            date: d,
                            downloads: drafts[d].trim() === '' ? null : Number(drafts[d]),
                          })),
                        )
                      }
                      className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {savePending ? 'Saving…' : `Save downloads (${dirtyDates.length})`}
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Pick Notek or Miqat above to type in downloads for that app.
                </span>
              )}
              {saveMsg ? <span className="text-xs text-muted-foreground">{saveMsg}</span> : null}
            </>
          ) : null}
          {tab === 'person' ? (
            <div className="inline-flex gap-1">
              {(
                [
                  ['all', 'Everyone'],
                  ['creator', 'Creators'],
                  ['reposter', 'Reposters'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setRoleView(id)} className={chip(roleView === id)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {tab === 'day' && pasteOpen && projectId != null ? (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Paste two columns from App Store / Play Console / Excel: date and downloads. One day per line,
              e.g. <code>2026-09-01, 120</code> or <code>09/01/2026 120</code>.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              className="rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savePending || parsePastedDownloads(pasteText).length === 0}
                onClick={() => saveDrafts(parsePastedDownloads(pasteText))}
                className="h-8 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Save {parsePastedDownloads(pasteText).length} days
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'day' ? (
          <div className="mt-2 overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} left-0 z-20 text-left`}>Date</th>
                  <th className={th} style={{ color: TT }}>TikTok videos</th>
                  <th className={th} style={{ color: IG }}>Instagram posts</th>
                  <th className={th} style={{ color: CREATOR }}>By creators</th>
                  <th className={th} style={{ color: REPOSTER }}>By reposters</th>
                  <th className={th} style={{ color: TT }}>TikTok views</th>
                  <th className={th} style={{ color: IG }}>Instagram views</th>
                  <th className={th} style={{ color: CREATOR }}>Creator views</th>
                  <th className={th} style={{ color: REPOSTER }}>Reposter views</th>
                  <th className={th}>Total views</th>
                  <th className={th}>Downloads</th>
                  <th className={th}>Views / download</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${totalTd} sticky left-0 text-left`}>Total</td>
                  <td className={totalTd}>{formatNumber(totals.ttVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.igVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.creatorVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.reposterVideos)}</td>
                  <td className={totalTd}>{formatNumber(totals.ttViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.igViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.creatorViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.reposterViews)}</td>
                  <td className={totalTd}>{formatNumber(totals.views)}</td>
                  <td className={totalTd}>{formatNumber(totalDownloads)}</td>
                  <td className={totalTd}>
                    {totalDownloads > 0 ? formatNumber(Math.round(totals.views / totalDownloads)) : '—'}
                  </td>
                </tr>
                {dates.map((d, i) => {
                  const a = byDay.get(d) ?? emptyDay()
                  const dl = downloadsByDate.get(d)
                  const draft = drafts[d]
                  return (
                    <tr key={d} className={i % 2 ? 'bg-muted/20' : ''}>
                      <td className={`${td} sticky left-0 bg-background text-left font-medium`}>
                        {dayLabel(d)}
                      </td>
                      <td className={td}>{n(a.ttVideos)}</td>
                      <td className={td}>{n(a.igVideos)}</td>
                      <td className={td}>{n(a.creatorVideos)}</td>
                      <td className={td}>{n(a.reposterVideos)}</td>
                      <td className={td}>{n(a.ttViews)}</td>
                      <td className={td}>{n(a.igViews)}</td>
                      <td className={td}>{n(a.creatorViews)}</td>
                      <td className={td}>{n(a.reposterViews)}</td>
                      <td className={`${td} font-semibold`}>{n(a.views)}</td>
                      <td className={`${td} p-0`}>
                        {projectId != null ? (
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft ?? (dl != null ? String(dl) : '')}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [d]: e.target.value }))}
                            placeholder="—"
                            className="h-7 w-24 bg-transparent px-2 text-right tabular-nums outline-none focus:bg-accent/40"
                          />
                        ) : (
                          <span className="px-2">{dl != null ? formatNumber(dl) : '—'}</span>
                        )}
                      </td>
                      <td className={td}>
                        {dl != null && dl > 0 ? formatNumber(Math.round(a.views / dl)) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'person' ? (
          <div className="mt-2 overflow-auto rounded-lg border border-border">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} left-0 z-20 min-w-44 text-left`}>Person</th>
                  <th className={th}>Total views</th>
                  <th className={th} style={{ color: TT }}>TikTok videos</th>
                  <th className={th} style={{ color: IG }}>Instagram posts</th>
                  <th className={th} style={{ color: TT }}>TikTok views</th>
                  <th className={th} style={{ color: IG }}>Instagram views</th>
                  {dates.map((d) => (
                    <th key={d} className={th}>
                      {dayLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${totalTd} sticky left-0 text-left`}>
                    Total ({visiblePeople.length})
                  </td>
                  <td className={totalTd}>{formatNumber(visibleTotals.views)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.ttVideos)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.igVideos)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.ttViews)}</td>
                  <td className={totalTd}>{formatNumber(visibleTotals.igViews)}</td>
                  {dates.map((d) => (
                    <td key={d} className={totalTd}>
                      {formatNumber(visibleTotals.perDate.get(d) ?? 0)}
                    </td>
                  ))}
                </tr>
                {visiblePeople.length === 0 ? (
                  <tr>
                    <td colSpan={6 + dates.length} className={`${td} text-left text-muted-foreground`}>
                      No videos in this range.
                    </td>
                  </tr>
                ) : (
                  visiblePeople.map((p, i) => (
                    <tr key={p.id} className={i % 2 ? 'bg-muted/20' : ''}>
                      <td className={`${td} sticky left-0 bg-background text-left`}>
                        <span className="font-medium">{p.name}</span>{' '}
                        <span
                          className="text-[10px] font-semibold uppercase"
                          style={{ color: p.role === 'reposter' ? REPOSTER : CREATOR }}
                        >
                          {p.role === 'reposter' ? 'R' : 'C'}
                        </span>
                      </td>
                      <td className={`${td} font-semibold`}>{n(p.views)}</td>
                      <td className={td}>{n(p.ttVideos)}</td>
                      <td className={td}>{n(p.igVideos)}</td>
                      <td className={td}>{n(p.ttViews)}</td>
                      <td className={td}>{n(p.igViews)}</td>
                      {dates.map((d) => {
                        const c = p.byDate.get(d)
                        return (
                          <td key={d} className={td} title={c ? `${c.videos} video(s)` : undefined}>
                            {c ? n(c.views) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'impact' ? (
          <div className="mt-2 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Compares each day&apos;s views with that day&apos;s downloads ({daysWithDownloads.length} day
              {daysWithDownloads.length === 1 ? '' : 's'} with downloads entered). A higher score means
              downloads tend to go up on the days those views go up. It&apos;s a pattern, not proof — more
              days of downloads make it more reliable (aim for 14+).
            </p>
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${th} text-left`}>Group</th>
                    <th className={th}>Match with downloads (−1 to 1)</th>
                    <th className={`${th} text-left`}>Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.groups.map((g) => {
                    const s = strengthLabel(g.r)
                    return (
                      <tr key={g.label}>
                        <td className={`${td} text-left font-medium`}>{g.label}</td>
                        <td className={td}>{g.r == null ? '—' : g.r.toFixed(2)}</td>
                        <td className={`${td} text-left ${s.className}`}>{s.text}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${th} text-left`}>Person</th>
                    <th className={th}>Views</th>
                    <th className={th}>Share of views</th>
                    <th className={th}>Days posted</th>
                    <th className={th}>Avg downloads when they posted</th>
                    <th className={th}>Avg downloads when they didn&apos;t</th>
                    <th className={th}>Match with downloads</th>
                    <th className={`${th} text-left`}>Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.perPerson.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`${td} text-left text-muted-foreground`}>
                        No videos in this range.
                      </td>
                    </tr>
                  ) : (
                    impact.perPerson.map((p, i) => {
                      const s = strengthLabel(p.r)
                      const lift =
                        p.avgPosted != null && p.avgNotPosted != null ? p.avgPosted - p.avgNotPosted : null
                      return (
                        <tr key={p.id} className={i % 2 ? 'bg-muted/20' : ''}>
                          <td className={`${td} text-left`}>
                            <span className="font-medium">{p.name}</span>{' '}
                            <span
                              className="text-[10px] font-semibold uppercase"
                              style={{ color: p.role === 'reposter' ? REPOSTER : CREATOR }}
                            >
                              {p.role === 'reposter' ? 'R' : 'C'}
                            </span>
                          </td>
                          <td className={td}>{formatNumber(p.views)}</td>
                          <td className={td}>{(p.share * 100).toFixed(1)}%</td>
                          <td className={td}>{p.daysPosted}</td>
                          <td className={td}>
                            {p.avgPosted == null ? '—' : formatNumber(Math.round(p.avgPosted))}
                          </td>
                          <td className={td}>
                            {p.avgNotPosted == null ? '—' : formatNumber(Math.round(p.avgNotPosted))}
                            {lift != null && lift !== 0 ? (
                              <span className={`ml-1 text-xs ${lift > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                ({lift > 0 ? '+' : ''}
                                {formatNumber(Math.round(lift))} when posting)
                              </span>
                            ) : null}
                          </td>
                          <td className={td}>{p.r == null ? '—' : p.r.toFixed(2)}</td>
                          <td className={`${td} text-left ${s.className}`}>{s.text}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
