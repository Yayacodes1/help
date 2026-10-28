import Link from 'next/link'
import { redirect } from 'next/navigation'
import { OutreachAdd } from '@/components/outreach/outreach-add'
import { OutreachBoard } from '@/components/outreach/outreach-board'
import { logoutOutreach } from '@/app/actions/outreach'
import { getAdminSession } from '@/lib/admin-auth'
import { getLeaderSession } from '@/lib/leader-auth'
import { leadImageUrl } from '@/lib/outreach-image'
import { resolveOutreachActor } from '@/lib/outreach-auth'
import {
  getOutreachTemplate,
  listOutreachLeads,
  listOutreachLeadsByActor,
  lookupOutreach,
} from '@/lib/outreach'
import {
  compareOutreachLeads,
  outreachGreeting,
  parseOutreachSort,
  parseOutreachStatusFilter,
} from '@/lib/outreach-status'
import { getAllProjects } from '@/lib/queries'
import { formatNumber } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; q?: string; sort?: string; status?: string }>
}) {
  const sp = await searchParams
  const actor = await resolveOutreachActor(sp.u)
  if (!actor) {
    const [admin, leader] = await Promise.all([getAdminSession(), getLeaderSession()])
    if (admin || leader || sp.u) {
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-3 px-5">
          <h1 className="text-xl font-semibold">Outreach</h1>
          <p className="text-sm text-muted-foreground">Ahmed has not added this account to outreach yet.</p>
          <Link href={leader ? '/leader' : '/admin'} className="text-sm font-medium underline">
            Back
          </Link>
        </main>
      )
    }
    redirect('/login')
  }

  const sort = parseOutreachSort(sp.sort)
  const status = parseOutreachStatusFilter(sp.status)
  const query = (sp.q ?? '').trim()
  const lookup = query ? await lookupOutreach(query) : null
  const greeting = outreachGreeting(actor)
  const back =
    actor.via === 'admin'
      ? { href: '/admin', label: 'Admin' }
      : actor.via === 'leader'
        ? { href: '/leader', label: 'Leader' }
        : actor.via === 'creator' && actor.creatorHandle
          ? { href: `/submit?u=${encodeURIComponent(actor.creatorHandle)}`, label: 'Reposter' }
          : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-5 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Outreach</h1>
        </div>
        <div className="flex items-center gap-2">
          {back ? (
            <Link href={back.href} className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium">
              {back.label}
            </Link>
          ) : (
            <form action={logoutOutreach}>
              <button type="submit" className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium">
                Log out
              </button>
            </form>
          )}
        </div>
      </header>

      <form action="/outreach" className="flex gap-2">
        {actor.creatorHandle ? <input type="hidden" name="u" value={actor.creatorHandle} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search a username or phone number"
          dir="ltr"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" className="h-11 rounded-lg border border-border px-3 text-sm font-medium">
          Search
        </button>
      </form>
      {lookup ? (
        <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
          {lookup.found ? (
            <>
              Already added · @{lookup.username} · {lookup.detail}
            </>
          ) : (
            'Not in the list.'
          )}
        </p>
      ) : null}

      {actor.role === 'upper' ? (
        <UpperList
          actorKey={actor.key}
          creatorHandle={actor.creatorHandle}
          sort={sort}
          status={status}
          query={query}
        />
      ) : (
        <OutreachHome actorKey={actor.key} creatorHandle={actor.creatorHandle} />
      )}
    </main>
  )
}

async function UpperList({
  actorKey,
  creatorHandle,
  sort,
  status,
  query,
}: {
  actorKey: string
  creatorHandle: string | null
  sort: ReturnType<typeof parseOutreachSort>
  status: ReturnType<typeof parseOutreachStatusFilter>
  query: string
}) {
  const [leads, template, projects] = await Promise.all([
    listOutreachLeads(),
    getOutreachTemplate(actorKey),
    getAllProjects(),
  ])
  const visible = leads
    .filter((lead) => (status === 'all' ? true : lead.status === status))
    .sort((a, b) => compareOutreachLeads(sort, a, b))

  return (
    <OutreachBoard
      leads={visible.map((lead) => ({
        ...lead,
        accountUrl: leadImageUrl(lead.id, 'account'),
        chatUrl: leadImageUrl(lead.id, 'chat'),
        blocked: lead.status === 'negotiating' && lead.negotiatorKey != null && lead.negotiatorKey !== actorKey,
      }))}
      template={template}
      projects={projects.map((project) => ({ id: project.id, name: project.name }))}
      sort={sort}
      status={status}
      query={query}
      creatorHandle={creatorHandle}
    />
  )
}

async function OutreachHome({
  actorKey,
  creatorHandle,
}: {
  actorKey: string
  creatorHandle: string | null
}) {
  const mine = await listOutreachLeadsByActor(actorKey)
  return (
    <div className="flex flex-col gap-5">
      <OutreachAdd creatorHandle={creatorHandle} />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          You added {mine.length} {mine.length === 1 ? 'person' : 'people'}
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mine.map((lead) => (
              <li key={lead.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                <span className="font-medium" dir="ltr">
                  @{lead.username}
                </span>
                <span className="text-muted-foreground" dir="ltr">
                  {' '}
                  · {lead.phone}
                  {lead.followers != null ? ` · ${formatNumber(lead.followers)} followers` : ''}
                  {lead.likes != null ? ` · ${formatNumber(lead.likes)} likes` : ''}
                </span>
                <span className="block text-muted-foreground">{lead.statusLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
