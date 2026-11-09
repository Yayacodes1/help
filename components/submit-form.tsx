'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Camera, Clock, Music2, Send, CheckCircle2, AlertCircle, Link2, Video } from 'lucide-react'
import { submitVideos } from '@/app/actions/creator'
import { PLATFORM_META } from '@/lib/platforms'
import type { Platform } from '@/lib/db'

const PLATFORM_ICON: Record<Platform, typeof Camera> = {
  instagram: Camera,
  tiktok: Music2,
  youtube: Video,
}

type PlatformField = {
  platform: Platform
  goal: number
  todayCount: number
}

type State = { ok: boolean; message: string; blocked?: number; videoDate?: string } | null

const RIYADH_TZ = 'Asia/Riyadh'

/** Riyadh wall clock as YYYY-MM-DD and HH:MM. */
function riyadhNow(d = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

function useNow(everyMs = 15_000): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** Social handles that belong to a project's brand accounts (lowercase, no @). */
export type BrandProject = { projectId: number; handles: string[] }

/** Handles found in links like tiktok.com/@name/video/… or instagram.com/name/reel/…. */
function handlesInLinks(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/tiktok\.com\/@([A-Za-z0-9._]+)/gi)) out.push(m[1].toLowerCase())
  for (const m of text.matchAll(/instagram\.com\/([A-Za-z0-9._]+)\/(?:reel|reels|p)\//gi)) {
    out.push(m[1].toLowerCase())
  }
  return out
}

type Labels = {
  pasteLinks: string
  pasteHint: string
  send: string
  sendTo: string
  sending: string
  project: string
  projectHint: string
  projectFixed: string
  pickProject: string
  autoProject: string
  postDate: string
  postTime: string
  postWhenHint: string
  dailyGoalLabel: string
  stepLinks: string
  stepWhen: string
  nowLabel: string
}

export function SubmitForm({
  username,
  fields,
  labels,
  projects,
  defaultProjectId = null,
  videoDate,
  defaultTime,
  brandProjects = [],
  dateLocked = false,
  maxDate,
}: {
  username: string
  fields: PlatformField[]
  labels: Labels
  /** Projects this person can post under (usually home, or both if dual-brand). */
  projects: { id: number; name: string }[]
  defaultProjectId?: number | null
  videoDate: string
  defaultTime: string
  brandProjects?: BrandProject[]
  /** Probation: date is fixed to today. */
  dateLocked?: boolean
  maxDate?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const formRef = useRef<HTMLFormElement>(null)
  const now = useNow()
  const riyadh = now ? riyadhNow(now) : null
  const [postDate, setPostDate] = useState(videoDate)
  const [postTime, setPostTime] = useState(defaultTime)
  useEffect(() => setPostDate(videoDate), [videoDate])

  const initialProject =
    defaultProjectId != null && projects.some((p) => p.id === defaultProjectId)
      ? String(defaultProjectId)
      : projects.length === 1
        ? String(projects[0].id)
        : ''

  const action = submitVideos.bind(null, username)
  const [state, formAction, pending] = useActionState<State, FormData>(action, null)
  const [projectId, setProjectId] = useState(initialProject)
  const [autoPicked, setAutoPicked] = useState<string | null>(null)
  const submittedLock = useRef(false)
  useEffect(() => {
    setProjectId(initialProject)
  }, [initialProject])
  const projectName = projects.find((p) => String(p.id) === projectId)?.name ?? null
  const multiProject = projects.length > 1
  const singleProject = projects.length === 1 ? projects[0] : null

  function syncDateInUrl(nextDate: string) {
    if (!nextDate || dateLocked) return
    if (nextDate === (params.get('date') ?? '')) return
    const next = new URLSearchParams(params.toString())
    next.set('date', nextDate)
    next.delete('vPage')
    router.push(`?${next.toString()}`, { scroll: false })
  }

  function onLinksChange(text: string) {
    if (!multiProject) return
    const found = handlesInLinks(text)
    const match = brandProjects.find((b) => b.handles.some((h) => found.includes(h)))
    if (!match) return
    if (!projects.some((p) => p.id === match.projectId)) return
    const name = projects.find((p) => p.id === match.projectId)?.name ?? null
    setProjectId(String(match.projectId))
    setAutoPicked(name)
  }

  useEffect(() => {
    if (!pending) submittedLock.current = false
  }, [pending])

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      setProjectId(initialProject)
      setAutoPicked(null)
      submittedLock.current = false
      if (state.videoDate && state.videoDate !== params.get('date')) {
        const next = new URLSearchParams(params.toString())
        next.set('date', state.videoDate)
        router.push(`?${next.toString()}`, { scroll: false })
      } else {
        router.refresh()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        if (pending || submittedLock.current) {
          e.preventDefault()
          return
        }
        submittedLock.current = true
      }}
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      {/* Today's goal — one glance */}
      <div className="grid grid-cols-3 gap-2">
        {fields.map(({ platform, goal, todayCount }) => {
          const meta = PLATFORM_META[platform]
          const met = goal > 0 && todayCount >= goal
          const Icon = PLATFORM_ICON[platform]
          return (
            <div
              key={platform}
              className={`min-w-0 rounded-xl border px-2 py-2.5 sm:px-3 ${
                met
                  ? 'border-emerald-300/60 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-card-foreground sm:text-sm">{meta.ar}</p>
                    {goal > 0 ? (
                      <p className="text-[10px] text-muted-foreground">{labels.dailyGoalLabel}</p>
                    ) : null}
                  </div>
                </div>
                {(goal > 0 || todayCount > 0) ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      met
                        ? 'bg-emerald-600 text-white'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {met ? <CheckCircle2 className="size-3" /> : null}
                    {goal > 0 ? `${todayCount}/${goal}` : todayCount}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Project: hidden when only one; clear choice when both */}
      {projects.length === 0 ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No projects are set up yet. Ask admin to add Notek and Miqat.
        </p>
      ) : singleProject ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm">
          <input type="hidden" name="project_id" value={singleProject.id} />
          <span className="text-muted-foreground">{labels.projectFixed}</span>
          <span className="font-semibold text-foreground">{singleProject.name}</span>
        </div>
      ) : (
        <fieldset className="rounded-xl border border-border bg-card p-3">
          <legend className="px-1 text-sm font-semibold text-foreground">{labels.project}</legend>
          <p className="mb-2 text-xs text-muted-foreground">{labels.projectHint}</p>
          <div className="grid grid-cols-2 gap-2">
            {projects.map((p) => {
              const on = String(p.id) === projectId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProjectId(String(p.id))
                    setAutoPicked(null)
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
          <input type="hidden" name="project_id" value={projectId} required />
          {autoPicked ? (
            <p className="mt-2 text-xs font-medium text-primary">
              {labels.autoProject} {autoPicked}
            </p>
          ) : null}
        </fieldset>
      )}

      {/* Links */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-foreground">
            <Link2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{labels.stepLinks}</p>
            <p className="text-xs text-muted-foreground">{labels.pasteHint}</p>
          </div>
        </div>
        <textarea
          name="links"
          rows={4}
          onChange={(e) => onLinksChange(e.target.value)}
          dir="ltr"
          placeholder={'https://www.instagram.com/reel/…\nhttps://www.youtube.com/watch?v=…\nhttps://www.tiktok.com/@…/video/…'}
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {state ? (
        <p
          className={`flex items-start gap-2 whitespace-pre-line break-words rounded-lg px-3 py-2 text-sm [overflow-wrap:anywhere] ${
            state.ok && 'blocked' in state && state.blocked
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : state.ok
                ? 'bg-primary/10 text-primary'
                : 'bg-destructive/10 text-destructive'
          }`}
          role="status"
        >
          {state.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{state.message}</span>
        </p>
      ) : null}

      {/* When — compact */}
      <div className="rounded-xl border border-border bg-card px-3 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{labels.stepWhen}</span>
          </div>
          {now && riyadh && !dateLocked ? (
            <button
              type="button"
              onClick={() => {
                setPostDate(riyadh.date)
                setPostTime(riyadh.time)
                syncDateInUrl(riyadh.date)
              }}
              className="h-7 rounded-lg border border-border bg-background px-2.5 text-[11px] font-semibold hover:bg-accent"
            >
              {labels.nowLabel}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.postDate}
            {dateLocked ? (
              <>
                <input type="hidden" name="video_date" value={postDate} />
                <span className="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium tabular-nums text-foreground">
                  {postDate}
                </span>
              </>
            ) : (
              <input
                type="date"
                name="video_date"
                required
                autoComplete="off"
                value={postDate}
                max={maxDate}
                onChange={(e) => {
                  const next = e.target.value
                  setPostDate(next)
                  syncDateInUrl(next)
                }}
                className="h-10 rounded-lg border border-border bg-background px-2 text-sm tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {labels.postTime}
            <input
              type="time"
              name="post_time"
              required
              step={60}
              value={postTime}
              onChange={(e) => setPostTime(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        {dateLocked ? (
          <p className="mt-2 text-[11px] text-muted-foreground">{labels.postWhenHint}</p>
        ) : null}
        {riyadh && postDate && postDate !== riyadh.date ? (
          <p className="mt-2 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            ⚠️ {postDate} ≠ {riyadh.date}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || (multiProject && !projectId)}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
      >
        <Send className={`size-4 ${pending ? 'animate-pulse' : ''}`} />
        {pending
          ? labels.sending
          : projectName
            ? `${labels.sendTo} ${projectName}`
            : labels.send}
      </button>
    </form>
  )
}
