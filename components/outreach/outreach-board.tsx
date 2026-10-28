'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  beginOutreachWhatsApp,
  closeOutreachLead,
  saveOutreachTemplate,
  setOutreachStatus,
  type OutreachActionState,
} from '@/app/actions/outreach'
import { formatNumber } from '@/lib/format'
import type { OutreachLeadStatus, OutreachSort } from '@/lib/outreach-status'

const initial: OutreachActionState = { ok: false, message: '' }

export type BoardLead = {
  id: number
  username: string
  phone: string
  followers: number | null
  likes: number | null
  platform: string | null
  status: OutreachLeadStatus
  statusLabel: string
  addedByName: string
  negotiatorName: string | null
  negotiatorKey: string | null
  accountUrl: string
  chatUrl: string
  blocked: boolean
}

const SORTS: { id: OutreachSort; label: string }[] = [
  { id: 'followers', label: 'Followers' },
  { id: 'likes', label: 'Likes' },
  { id: 'both', label: 'Both' },
]

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Not contacted' },
  { id: 'negotiating', label: 'Negotiating' },
  { id: 'done', label: 'Done' },
  { id: 'passed', label: 'Not closed' },
  { id: 'closed', label: 'Closed' },
]

function listHref(input: { sort: string; status: string; q: string; creatorHandle: string | null }) {
  const params = new URLSearchParams()
  if (input.creatorHandle) params.set('u', input.creatorHandle)
  if (input.q) params.set('q', input.q)
  if (input.sort !== 'followers') params.set('sort', input.sort)
  if (input.status !== 'all') params.set('status', input.status)
  const query = params.toString()
  return query ? `/outreach?${query}` : '/outreach'
}

export function OutreachBoard({
  leads,
  template,
  projects,
  sort,
  status,
  query,
  creatorHandle,
}: {
  leads: BoardLead[]
  template: string
  projects: { id: number; name: string }[]
  sort: OutreachSort
  status: string
  query: string
  creatorHandle: string | null
}) {
  const [templateState, saveTemplate, templatePending] = useActionState(saveOutreachTemplate, initial)

  return (
    <div className="flex flex-col gap-4">
      <form action={saveTemplate} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        {creatorHandle ? <input type="hidden" name="creator_handle" value={creatorHandle} /> : null}
        <label className="text-sm font-medium" htmlFor="outreach-template">
          Your WhatsApp message
        </label>
        <textarea
          id="outreach-template"
          name="body"
          key={template}
          defaultValue={template}
          rows={4}
          maxLength={2000}
          placeholder="This message is yours. Other managers keep their own."
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={templatePending}
            className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {templatePending ? 'Saving…' : 'Save message'}
          </button>
          {templateState.message ? <p className="text-sm text-muted-foreground">{templateState.message}</p> : null}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {SORTS.map((item) => (
            <Link
              key={item.id}
              href={listHref({ sort: item.id, status, q: query, creatorHandle })}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                sort === item.id ? 'bg-primary text-primary-foreground' : 'border border-border'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Link
              key={item.id}
              href={listHref({ sort, status: item.id, q: query, creatorHandle })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                status === item.id ? 'bg-foreground text-background' : 'text-muted-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No accounts in this list yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => (
            <li key={lead.id} className="rounded-2xl border border-border bg-card p-4">
              <LeadCard lead={lead} projects={projects} creatorHandle={creatorHandle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LeadCard({
  lead,
  projects,
  creatorHandle,
}: {
  lead: BoardLead
  projects: { id: number; name: string }[]
  creatorHandle: string | null
}) {
  const router = useRouter()
  const [closeState, closeAction, closePending] = useActionState(closeOutreachLead, initial)
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const defaultPlatform = lead.platform === 'instagram' || lead.platform === 'tiktok' ? lead.platform : 'both'

  async function send() {
    setSendError('')
    setSending(true)
    try {
      const result = await beginOutreachWhatsApp(lead.id, creatorHandle ?? '')
      if (!result.ok) {
        setSendError(result.message)
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
      router.refresh()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold" dir="ltr">
            @{lead.username}
          </p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {lead.phone}
          </p>
        </div>
        <p className="text-sm font-medium">
          {lead.status === 'passed' ? <span className="mr-1 font-bold">X</span> : null}
          {lead.statusLabel}
        </p>
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">
        {lead.followers == null ? 'Followers —' : `${formatNumber(lead.followers)} followers`}
        {' · '}
        {lead.likes == null ? 'Likes —' : `${formatNumber(lead.likes)} likes`}
        {lead.platform && lead.platform !== 'unknown' ? ` · ${lead.platform}` : ''}
        {' · added by '}
        {lead.addedByName}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <a href={lead.accountUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lead.accountUrl}
            alt={`Account picture for @${lead.username}`}
            className="h-40 w-full rounded-lg border border-border object-cover"
          />
          <span className="mt-1 block text-xs text-muted-foreground">Account picture</span>
        </a>
        <a href={lead.chatUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lead.chatUrl}
            alt={`Phone chat for @${lead.username}`}
            className="h-40 w-full rounded-lg border border-border object-cover"
          />
          <span className="mt-1 block text-xs text-muted-foreground">Phone number picture</span>
        </a>
      </div>

      {lead.blocked ? null : (
        <div className="flex flex-wrap gap-2">
          {lead.status === 'open' ? (
            <StatusButton id={lead.id} status="negotiating" creatorHandle={creatorHandle} label="Negotiate" />
          ) : null}
          {lead.status === 'negotiating' ? (
            <StatusButton id={lead.id} status="done" creatorHandle={creatorHandle} label="Negotiation done" />
          ) : null}
          {lead.status !== 'passed' && lead.status !== 'closed' ? (
            <StatusButton id={lead.id} status="passed" creatorHandle={creatorHandle} label="X · not closed" />
          ) : null}
          {lead.status !== 'closed' ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {sending ? 'Opening WhatsApp…' : 'Send on WhatsApp'}
            </button>
          ) : null}
        </div>
      )}
      {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}

      {lead.status !== 'closed' && !lead.blocked ? (
        <form action={closeAction} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={lead.id} />
          {creatorHandle ? <input type="hidden" name="creator_handle" value={creatorHandle} /> : null}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Project
            <select
              name="project_id"
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">No project yet</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Platforms
            <select
              name="platforms"
              defaultValue={defaultPlatform}
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="both">Both</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={closePending}
            className="h-10 rounded-lg border border-border text-sm font-semibold hover:bg-accent disabled:opacity-60 sm:col-span-2"
          >
            {closePending ? 'Adding…' : 'Close and add as creator'}
          </button>
          {closeState.message ? (
            <p className={`text-sm sm:col-span-2 ${closeState.ok ? '' : 'text-destructive'}`}>{closeState.message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}

function StatusButton({
  id,
  status,
  label,
  creatorHandle,
}: {
  id: number
  status: 'negotiating' | 'done' | 'passed'
  label: string
  creatorHandle: string | null
}) {
  return (
    <form action={setOutreachStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      {creatorHandle ? <input type="hidden" name="creator_handle" value={creatorHandle} /> : null}
      <button
        type="submit"
        className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent"
      >
        {label}
      </button>
    </form>
  )
}
