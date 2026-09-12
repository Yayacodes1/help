'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Copy, Download, Search } from 'lucide-react'
import { DateRangePresets } from '@/components/admin/date-range-presets'
import { SubmissionsTable } from '@/components/admin/submissions-table'
import { formatNumber } from '@/lib/format'
import { adminPersonHref } from '@/lib/admin-href'
import type { AdminSubmissionRow } from '@/lib/queries'
import type { RoleFilter } from '@/lib/participant-role'
import type { ProjectViewsBoard, ProjectViewsPerson } from '@/lib/project-views'

type Labels = {
  from: string
  to: string
  apply: string
  empty: string
  views: string
  videos: string
  combined: string
  kind: string
  creators: string
  reposters: string
  all: string
  person: string
  everyone: string
  extractCopy: string
  extractCopied: string
  extractCsv: string
  changeHint: string
  noProject: string
  creatorRole: string
  reposterRole: string
  instagram: string
  tiktok: string
  search: string
  noVideosMatch: string
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function boardToRows(board: ProjectViewsBoard, people: ProjectViewsPerson[]) {
  const headers = [
    'Person',
    'Kind',
    ...board.projects.map((p) => p.name),
    ...(board.totals.unassignedVideos > 0 ? ['Unassigned'] : []),
    'Combined',
    'Videos',
    'Instagram',
    'TikTok',
  ]
  const lines = people.map((row) => [
    row.name,
    row.role,
    ...board.projects.map((p) => row.viewsByProject[p.id] ?? 0),
    ...(board.totals.unassignedVideos > 0 ? [row.unassignedViews] : []),
    row.views,
    row.videos,
    row.viewsInstagram,
    row.viewsTiktok,
  ])
  return { headers, lines }
}

export function ProjectViewsPanel({
  board,
  submissions,
  selectedCreatorId,
  mode,
  kind,
  today,
  defaultFrom,
  defaultTo,
  labels,
}: {
  board: ProjectViewsBoard
  submissions: AdminSubmissionRow[]
  selectedCreatorId: number | null
  mode: 'combined' | number
  kind: RoleFilter
  today: string
  defaultFrom: string
  defaultTo: string
  labels: Labels
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)

  const focusedProject = typeof mode === 'number' ? mode : null

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    next.set('panel', 'projectviews')
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin?${next.toString()}`)
  }

  const ranked = useMemo(() => {
    const rows = board.people.filter((p) => p.videos > 0)
    return [...rows].sort((a, b) => {
      const av = focusedProject != null ? (a.viewsByProject[focusedProject] ?? 0) : a.views
      const bv = focusedProject != null ? (b.viewsByProject[focusedProject] ?? 0) : b.views
      if (bv !== av) return bv - av
      return a.name.localeCompare(b.name)
    })
  }, [board.people, focusedProject])

  const selected = selectedCreatorId
    ? (board.people.find((p) => p.creatorId === selectedCreatorId) ?? null)
    : null

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return ranked
    return ranked.filter((row) => row.name.toLowerCase().includes(needle))
  }, [ranked, q])

  const visibleVideos = useMemo(() => {
    if (focusedProject == null) return submissions
    return submissions.filter((s) => s.project_id === focusedProject)
  }, [submissions, focusedProject])

  const focusViews =
    focusedProject != null ? (board.totals.viewsByProject[focusedProject] ?? 0) : board.totals.views

  function extractText(sep: string) {
    const { headers, lines } = boardToRows(board, ranked)
    return [headers.join(sep), ...lines.map((line) => line.map(csvEscape).join(sep))].join('\n')
  }

  async function copyNumbers() {
    const text = extractText('\t')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.top = '-1000px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function downloadCsv() {
    const blob = new Blob([`\uFEFF${extractText(',')}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `project-views-${board.from}-${board.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`

  const showUnassigned = board.totals.unassignedVideos > 0

  return (
    <div className="flex flex-col gap-4">
      <DateRangePresets
        today={today}
        from={from}
        to={to}
        onSelect={(nextFrom, nextTo) => {
          setFrom(nextFrom)
          setTo(nextTo)
          push({ pvFrom: nextFrom, pvTo: nextTo })
        }}
      />

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          push({ pvFrom: from, pvTo: to })
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.from}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.to}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.kind}
          <select
            value={kind}
            onChange={(e) =>
              push({
                pvKind: e.target.value,
                pvPerson: null,
              })
            }
            className="h-9 min-w-40 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="creator">{labels.creators}</option>
            <option value="reposter">{labels.reposters}</option>
            <option value="all">{labels.all}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {labels.person}
          <select
            value={selectedCreatorId ?? ''}
            onChange={(e) => push({ pvPerson: e.target.value || null })}
            className="h-9 min-w-44 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">{labels.everyone}</option>
            {board.roster.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm hover:bg-accent"
        >
          {labels.apply}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1"
          role="group"
          aria-label="Project"
        >
          {board.projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => push({ pvMode: String(p.id) })}
              className={toggleClass(mode === p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => push({ pvMode: 'combined' })}
            className={toggleClass(mode === 'combined')}
          >
            {labels.combined}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyNumbers()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? labels.extractCopied : labels.extractCopy}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent"
          >
            <Download className="size-3.5" />
            {labels.extractCsv}
          </button>
        </div>
      </div>

      {board.projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {board.projects.map((p) => {
            const active = mode === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => push({ pvMode: String(p.id) })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/40'
                }`}
              >
                <div className="text-lg font-semibold tabular-nums">
                  {formatNumber(board.totals.viewsByProject[p.id] ?? 0)}
                </div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {p.name}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(board.totals.videosByProject[p.id] ?? 0)} {labels.videos}
                </p>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => push({ pvMode: 'combined' })}
            className={`rounded-lg border p-3 text-left transition-colors ${
              mode === 'combined'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-accent/40'
            }`}
          >
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(board.totals.views)}
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.combined}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(board.totals.videos)} {labels.videos}
              {' · '}
              {labels.instagram} {formatNumber(board.totals.viewsInstagram)}
              {' · '}
              {labels.tiktok} {formatNumber(board.totals.viewsTiktok)}
            </p>
          </button>
        </div>
      )}

      {selected ? (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div>
            <a
              href={adminPersonHref(selected.creatorId, {
                role: kind === 'creator' ? null : kind,
                from: 'projectviews',
              })}
              className="text-sm font-semibold underline-offset-4 hover:underline"
            >
              {selected.name}
            </a>
            <p className="text-xs text-muted-foreground">
              {selected.role === 'reposter' ? labels.reposterRole : labels.creatorRole}
              {' · '}
              {formatNumber(
                focusedProject != null
                  ? (selected.viewsByProject[focusedProject] ?? 0)
                  : selected.views,
              )}{' '}
              {labels.views}
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {board.projects.map((p) => (
              <div key={p.id} className="rounded-md border border-border bg-background px-2 py-1.5">
                <dt className="text-muted-foreground">{p.name}</dt>
                <dd className="font-semibold tabular-nums">
                  {formatNumber(selected.viewsByProject[p.id] ?? 0)} {labels.views}
                </dd>
              </div>
            ))}
            <div className="rounded-md border border-border bg-background px-2 py-1.5">
              <dt className="text-muted-foreground">{labels.combined}</dt>
              <dd className="font-semibold tabular-nums">
                {formatNumber(selected.views)} {labels.views}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{labels.changeHint}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.search}
            className="h-9 w-48 rounded-lg border border-input bg-background pl-8 pr-2 text-sm"
          />
        </label>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatNumber(focusViews)} {labels.views}
          {' · '}
          {filtered.length}{' '}
          {kind === 'reposter'
            ? labels.reposters
            : kind === 'all'
              ? labels.all
              : labels.creators}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">{labels.person}</th>
                {kind === 'all' ? <th className="px-3 py-2 font-medium">{labels.kind}</th> : null}
                {board.projects.map((p) => (
                  <th key={p.id} className="px-3 py-2 font-medium">
                    {p.name}
                  </th>
                ))}
                {showUnassigned ? (
                  <th className="px-3 py-2 font-medium">{labels.noProject}</th>
                ) : null}
                <th className="px-3 py-2 font-medium">{labels.combined}</th>
                <th className="px-3 py-2 font-medium">{labels.videos}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const active = selectedCreatorId === row.creatorId
                return (
                  <tr
                    key={row.creatorId}
                    className={`border-b border-border last:border-0 ${
                      active ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          push({ pvPerson: active ? null : String(row.creatorId) })
                        }
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </button>
                    </td>
                    {kind === 'all' ? (
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.role === 'reposter' ? labels.reposterRole : labels.creatorRole}
                      </td>
                    ) : null}
                    {board.projects.map((p) => (
                      <td
                        key={p.id}
                        className={`px-3 py-2 tabular-nums ${
                          focusedProject === p.id
                            ? 'font-semibold text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatNumber(row.viewsByProject[p.id] ?? 0)}
                      </td>
                    ))}
                    {showUnassigned ? (
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {formatNumber(row.unassignedViews)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {formatNumber(row.views)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.videos}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedCreatorId != null ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {selected?.name ?? labels.person} · {labels.videos}
          </h3>
          <SubmissionsTable
            submissions={visibleVideos}
            emptyLabel={labels.noVideosMatch}
            showCreator={false}
            showProject
            editableViews
            editableProject
            projects={board.projects}
            noProjectLabel={labels.noProject}
            linkRole={kind === 'creator' ? null : kind}
            linkFrom="projectviews"
          />
        </div>
      ) : null}
    </div>
  )
}
