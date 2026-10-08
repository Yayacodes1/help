'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Pause, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react'
import type { Project } from '@/lib/db'
import type { CreatorTrackingRow } from '@/lib/queries'
import type { ParticipantRole, RoleFilter } from '@/lib/participant-role'
import {
  createCreator,
  deleteCreator,
  pauseCreator,
  resumeCreator,
  updateCreator,
} from '@/app/actions/admin'
import { RoleQuickSelect } from '@/components/admin/role-quick-select'
import { BulkReposterPay } from '@/components/admin/bulk-reposter-pay'
import { BrandHandleFields, PersonHandlesLine } from '@/components/person-handles'
import { adminPersonHref } from '@/lib/admin-href'
import Link from 'next/link'

function GoalPill({
  label,
  today,
  goal,
}: {
  label: string
  today: number
  goal: number
}) {
  if (goal <= 0) return null
  const met = today >= goal
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        met ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
      }`}
    >
      {label} {today}/{goal}
    </span>
  )
}

export function CreatorsManager({
  creators,
  pausedCreators = [],
  projects,
  roleFilter = 'creator',
  today,
  currentProjectId,
  isOwner = false,
  leaders = [],
}: {
  creators: CreatorTrackingRow[]
  pausedCreators?: CreatorTrackingRow[]
  projects: Project[]
  roleFilter?: RoleFilter
  today?: string
  currentProjectId?: number | string | null
  isOwner?: boolean
  leaders?: { id: number; name: string }[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<number[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'name' | 'videos' | 'streak' | 'today'>('name')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    const list = q
      ? creators.filter((c) =>
          [
            c.name,
            c.tiktok_username,
            c.instagram_username,
            c.notek_tiktok_username,
            c.notek_instagram_username,
            c.miqat_tiktok_username,
            c.miqat_instagram_username,
          ].some((v) => v?.toLowerCase().includes(q)),
        )
      : creators
    const today = (c: CreatorTrackingRow) => c.today_instagram + c.today_tiktok
    return [...list].sort((a, b) => {
      if (sort === 'videos') return b.total_videos - a.total_videos || a.name.localeCompare(b.name)
      if (sort === 'streak') return b.current_streak - a.current_streak || a.name.localeCompare(b.name)
      if (sort === 'today') return today(b) - today(a) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
  }, [creators, query, sort])

  const defaultRole: ParticipantRole =
    roleFilter === 'reposter' ? 'reposter' : 'creator'
  const heading =
    roleFilter === 'reposter'
      ? 'Reposters'
      : roleFilter === 'all'
        ? 'Creators & reposters'
        : 'Creators'
  const addLabel =
    roleFilter === 'reposter'
      ? 'Add reposter'
      : roleFilter === 'all'
        ? 'Add person'
        : 'Add creator'
  const emptyLabel =
    roleFilter === 'reposter'
      ? 'No reposters yet.'
      : roleFilter === 'all'
        ? 'No people yet.'
        : 'No creators yet.'

  const selectClass =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const goalInputClass =
    'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const ids = visible.map((c) => c.id)
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id))

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function GoalInputs({
    ig = 0,
    tt = 0,
  }: {
    ig?: number
    tt?: number
  }) {
    return (
      <div className="grid w-full grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Instagram/day
          <input type="number" min={0} name="goal_instagram" defaultValue={ig} className={goalInputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          TikTok/day
          <input type="number" min={0} name="goal_tiktok" defaultValue={tt} className={goalInputClass} />
        </label>
      </div>
    )
  }

  function RoleSelect({ defaultValue }: { defaultValue: ParticipantRole }) {
    return (
      <select name="role" defaultValue={defaultValue} className={selectClass}>
        <option value="creator">Creator</option>
        <option value="reposter">Reposter</option>
      </select>
    )
  }

  function HandleFields({
    name,
    tiktok,
    instagram,
    loginPlatform,
    notekTiktok,
    notekInstagram,
    miqatTiktok,
    miqatInstagram,
  }: {
    name?: string
    tiktok?: string | null
    instagram?: string | null
    loginPlatform?: string | null
    notekTiktok?: string | null
    notekInstagram?: string | null
    miqatTiktok?: string | null
    miqatInstagram?: string | null
  }) {
    return (
      <div className="grid w-full gap-2">
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Display name
            <input
              name="name"
              defaultValue={name ?? ''}
              placeholder="Optional if a handle is set"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            TikTok username
            <input
              name="tiktok_username"
              defaultValue={tiktok ?? ''}
              placeholder="@tiktok"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Instagram username
            <input
              name="instagram_username"
              defaultValue={instagram ?? ''}
              placeholder="@instagram"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Login account
            <select
              name="login_platform"
              defaultValue={loginPlatform === 'instagram' ? 'instagram' : 'tiktok'}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
        </div>
        <BrandHandleFields
          notekTiktok={notekTiktok}
          notekInstagram={notekInstagram}
          miqatTiktok={miqatTiktok}
          miqatInstagram={miqatInstagram}
        />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        They submit at the shared <span className="font-medium">/submit</span> or{' '}
        <span className="font-medium">/login</span> link using the Instagram or TikTok account
        chosen as their login account. That same handle is what shows on the ranking.
      </p>

      {roleFilter === 'reposter' && today ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(allSelected ? [] : ids)}
              className="rounded-md border border-border px-2 py-1 hover:bg-accent"
            >
              {allSelected ? 'Clear selection' : 'Select all visible'}
            </button>
            <span className="text-muted-foreground">{selected.length} selected</span>
          </div>
          <BulkReposterPay today={today} selectedIds={selected} isOwner={isOwner} />
        </>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or @handle…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className={selectClass}
          aria-label="Sort"
        >
          <option value="name">Sort: name</option>
          <option value="today">Sort: posted today</option>
          <option value="videos">Sort: total videos</option>
          <option value="streak">Sort: streak</option>
        </select>
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
            addOpen ? 'border border-border hover:bg-accent' : 'bg-primary text-primary-foreground'
          }`}
        >
          {addOpen ? <X className="size-4" /> : <Plus className="size-4" />}
          {addOpen ? 'Close' : addLabel}
        </button>
      </div>

      {addOpen ? (
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            await createCreator(fd)
            formRef.current?.reset()
            setAddOpen(false)
          })
        }
        className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
      >
        <HandleFields />
        <div className="flex flex-wrap gap-2">
          <select name="project_id" defaultValue="" className={selectClass}>
            <option value="">Both (Notek + Miqat)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <RoleSelect defaultValue={defaultRole} />
        </div>
        <select name="platforms" defaultValue="both" className={selectClass}>
          <option value="both">Instagram + TikTok</option>
          <option value="tiktok">TikTok only</option>
          <option value="instagram">Instagram only</option>
        </select>
        <GoalInputs />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {addLabel}
        </button>
      </form>
      ) : null}

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {visible.length === 0 ? (
          <li className="py-2 text-sm text-muted-foreground">
            {creators.length === 0 ? emptyLabel : 'No one matches that search.'}
          </li>
        ) : (
          visible.map((c) => (
            <li key={c.id} className="py-3">
              {editingId === c.id ? (
                <form
                  action={(fd) =>
                    startTransition(async () => {
                      await updateCreator(c.id, fd)
                      setEditingId(null)
                    })
                  }
                  className="flex flex-col gap-2"
                >
                  <HandleFields
                    name={c.name}
                    tiktok={c.tiktok_username}
                    instagram={c.instagram_username}
                    loginPlatform={c.login_platform}
                    notekTiktok={c.notek_tiktok_username}
                    notekInstagram={c.notek_instagram_username}
                    miqatTiktok={c.miqat_tiktok_username}
                    miqatInstagram={c.miqat_instagram_username}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select name="project_id" defaultValue={c.project_id ?? ''} className={selectClass}>
                      <option value="">Both (Notek + Miqat)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <RoleSelect defaultValue={c.role === 'reposter' ? 'reposter' : 'creator'} />
                    <select
                      name="leader_id"
                      defaultValue={c.leader_id ?? ''}
                      className={selectClass}
                      aria-label="Leader"
                    >
                      <option value="">No leader</option>
                      {leaders.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          Leader: {leader.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select name="platforms" defaultValue={c.platforms || 'both'} className={selectClass}>
                    <option value="both">Instagram + TikTok</option>
                    <option value="tiktok">TikTok only</option>
                    <option value="instagram">Instagram only</option>
                  </select>
                  <GoalInputs ig={c.goal_instagram} tt={c.goal_tiktok} />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      {roleFilter === 'reposter' ? (
                        <input
                          type="checkbox"
                          className="mt-1.5"
                          checked={selected.includes(c.id)}
                          onChange={() => toggle(c.id)}
                          aria-label={`Select ${c.name}`}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={adminPersonHref(c.id, {
                              role: roleFilter,
                              projectId: currentProjectId,
                              from: 'manage',
                            })}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {c.name}
                          </Link>
                          <RoleQuickSelect creatorId={c.id} role={c.role} />
                          <Link
                            href={adminPersonHref(c.id, {
                              role: roleFilter,
                              projectId: currentProjectId,
                              panel: 'contracts',
                              from: 'manage',
                            })}
                            className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                          >
                            Contracts
                          </Link>
                          <Link
                            href={adminPersonHref(c.id, {
                              role: roleFilter,
                              projectId: currentProjectId,
                              panel: 'commission',
                              from: 'manage',
                            })}
                            className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                          >
                            Commission
                          </Link>
                        </div>
                        <PersonHandlesLine person={c} />
                        <div className="text-xs text-muted-foreground">
                          {c.project_name ?? 'Both projects'} · {c.total_videos} total · streak{' '}
                          {c.current_streak}
                          {c.leader_name ? ` · Leader: ${c.leader_name}` : ''}
                          {c.pay_due ? ' · pay due' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(c.id)}
                        className="rounded-md border border-border p-1.5 hover:bg-accent"
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            confirm(
                              `Pause "${c.name}"? They leave the daily lists, Telegram report and strikes. Their past videos stay in analytics.`,
                            )
                          )
                            startTransition(() => pauseCreator(c.id))
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                        title="Pause — stopped working with us"
                      >
                        <Pause className="size-3.5" />
                        Pause
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}" and all their submissions?`))
                            startTransition(() => deleteCreator(c.id))
                        }}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Today:</span>
                    <GoalPill label="IG" today={c.today_instagram} goal={c.goal_instagram} />
                    <GoalPill label="TT" today={c.today_tiktok} goal={c.goal_tiktok} />
                    {c.goal_instagram + c.goal_tiktok === 0 && (
                      <span className="text-xs text-muted-foreground">No goals set</span>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      {pausedCreators.length > 0 ? (
        <details className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Paused ({pausedCreators.length})
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              stopped working with us — hidden from daily lists, still in analytics
            </span>
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {pausedCreators.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link
                    href={adminPersonHref(c.id, {
                      role: roleFilter,
                      projectId: currentProjectId,
                      from: 'manage',
                    })}
                    className="font-medium text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {c.role === 'reposter' ? 'Reposter' : 'Creator'} · paused since {c.paused_at} ·{' '}
                    {c.total_videos} total videos
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(() => resumeCreator(c.id))}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                    title="Resume — working with us again"
                  >
                    <Play className="size-3.5" />
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${c.name}" and all their submissions?`))
                        startTransition(() => deleteCreator(c.id))
                    }}
                    className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
