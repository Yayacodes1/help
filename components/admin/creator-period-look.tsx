'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { ConsistencyCalendar } from '@/components/admin/consistency-calendar'
import { adminPersonHref } from '@/lib/admin-href'
import { shiftYearMonth } from '@/lib/biweekly'
import { monthRange } from '@/lib/campaign'
import { formatDate, formatNumber } from '@/lib/format'
import type { CreatorPeriodLook, CreatorPeriodPerson } from '@/lib/creator-period-look'
import { projectToneClass } from '@/lib/project-scope'

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function CreatorPeriodLookPanel({
  people,
  look,
  selectedId,
  defaultFrom,
  defaultTo,
  labels,
}: {
  people: CreatorPeriodPerson[]
  look: CreatorPeriodLook | null
  selectedId: number | null
  defaultFrom: string
  defaultTo: string
  labels: {
    hint: string
    pickPerson: string
    search: string
    from: string
    to: string
    apply: string
    thisMonth: string
    lastMonth: string
    empty: string
    pickHint: string
    daysPosted: string
    videos: string
    views: string
    consistency: string
    hitRate: string
    missed: string
    partial: string
    calendar: string
    contract: string
    noContract: string
    openPerson: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(
    look?.from ?? params.get('lookFrom') ?? defaultFrom,
  )
  const [to, setTo] = useState(look?.to ?? params.get('lookTo') ?? defaultTo)

  const filteredPeople = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return people
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.projectName?.toLowerCase().includes(needle) ?? false),
    )
  }, [people, q])

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'look')
    next.set('tab', 'people')
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }

  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    push({
      lookId: selectedId != null ? String(selectedId) : null,
      lookFrom: nextFrom,
      lookTo: nextTo,
    })
  }

  const today = look?.today ?? new Date().toISOString().slice(0, 10)
  const thisMonth = monthRange(today)
  const lastMonthKey = shiftYearMonth(today.slice(0, 7), -1)
  const lastMonthStart = `${lastMonthKey}-01`
  // Last day of last month, or today if somehow future.
  const [ly, lm] = lastMonthKey.split('-').map(Number)
  const lastMonthEnd = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{labels.hint}</p>

      <div className="grid gap-3 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={labels.search}
              className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm"
            />
          </label>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {labels.pickPerson}
          </p>
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {filteredPeople.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">{labels.empty}</li>
            ) : (
              filteredPeople.map((person) => {
                const on = person.id === selectedId
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() =>
                        push({
                          lookId: String(person.id),
                          lookFrom: from || null,
                          lookTo: to || null,
                        })
                      }
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent/50 ${
                        on ? 'bg-primary/10 font-semibold' : ''
                      }`}
                    >
                      <span>{person.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
                        {person.role === 'reposter' ? 'Reposter' : 'Creator'}
                        {person.projectName ? (
                          <span
                            className={`rounded border px-1 py-0.5 ${projectToneClass(person.projectName)}`}
                          >
                            {person.projectName}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {labels.from}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {labels.to}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => applyRange(from, to)}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              {labels.apply}
            </button>
            <button
              type="button"
              onClick={() => applyRange(thisMonth.start, thisMonth.end)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent"
            >
              {labels.thisMonth}
            </button>
            <button
              type="button"
              onClick={() => applyRange(lastMonthStart, lastMonthEnd > today ? today : lastMonthEnd)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent"
            >
              {labels.lastMonth}
            </button>
          </div>

          {!look ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {labels.pickHint}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{look.creator.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(look.from)} → {formatDate(look.to)}
                    {' · '}
                    {look.contract ? (
                      <>
                        {labels.contract}: {look.contract.name}
                      </>
                    ) : (
                      labels.noContract
                    )}
                  </p>
                </div>
                <Link
                  href={adminPersonHref(look.creator.id, {
                    panel: 'consistency',
                    from: 'look',
                  })}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {labels.openPerson}
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xl font-semibold tabular-nums">{look.daysPosted}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{labels.daysPosted}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xl font-semibold tabular-nums">
                    {formatNumber(look.videos)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{labels.videos}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xl font-semibold tabular-nums">
                    {formatNumber(look.views)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {labels.views}
                    <span className="mt-0.5 block tabular-nums opacity-80">
                      IG {formatNumber(look.viewsInstagram)} · TT{' '}
                      {formatNumber(look.viewsTiktok)}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <div
                    className={`text-xl font-semibold tabular-nums ${
                      look.consistency.hitRate < 0.67
                        ? 'text-[#9a0d18] dark:text-rose-300'
                        : 'text-[#0f7a3d] dark:text-emerald-300'
                    }`}
                  >
                    {pct(look.consistency.hitRate)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {labels.hitRate}
                    <span className="mt-0.5 block">
                      {look.consistency.missDays} {labels.missed} · {look.consistency.partialDays}{' '}
                      {labels.partial}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="mb-3 text-sm font-semibold">
                  {labels.calendar} · {labels.consistency}
                </h4>
                <ConsistencyCalendar days={look.consistency.days} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
