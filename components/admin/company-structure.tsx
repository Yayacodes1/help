'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { saveCompanyRoleName } from '@/app/actions/company-structure'
import type { CompanyStructure, ExecutiveRoleId } from '@/lib/company-roles'

function RoleMembers({
  title,
  people,
  empty,
}: {
  title: string
  people: CompanyStructure['leaders']
  empty: string
}) {
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="tabular-nums text-xs font-medium text-muted-foreground">{people.length}</span>
      </summary>
      {people.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col border-t border-border">
          {people.map((person) => (
            <li key={person.key} className="border-b border-border last:border-b-0">
              {person.href ? (
                <Link
                  href={person.href}
                  className="block px-4 py-2.5 text-sm hover:bg-accent"
                >
                  {person.name}
                </Link>
              ) : (
                <span className="block px-4 py-2.5 text-sm">{person.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function ExecutiveRow({
  id,
  label,
  name,
  notAssigned,
  saveLabel,
  clearLabel,
  canEdit,
}: {
  id: ExecutiveRoleId
  label: string
  name: string | null
  notAssigned: string
  saveLabel: string
  clearLabel: string
  canEdit: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(name ?? '')
  const [saved, setSaved] = useState(name)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {canEdit ? (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          action={(fd) => {
            startTransition(async () => {
              const res = await saveCompanyRoleName(fd)
              if (res.ok) {
                const next = (fd.get('name') ?? '').toString().trim() || null
                setSaved(next)
                setValue(next ?? '')
              }
            })
          }}
        >
          <input type="hidden" name="role" value={id} />
          <input
            name="name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={notAssigned}
            maxLength={80}
            className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saveLabel}
            </button>
            <button
              type="button"
              disabled={pending || !saved}
              onClick={() => {
                setValue('')
                startTransition(async () => {
                  const fd = new FormData()
                  fd.set('role', id)
                  fd.set('name', '')
                  const res = await saveCompanyRoleName(fd)
                  if (res.ok) setSaved(null)
                })
              }}
              className="h-10 rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-60"
            >
              {clearLabel}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-sm font-medium">{saved ?? notAssigned}</p>
      )}
      {!saved && canEdit ? (
        <p className="mt-1 text-xs text-muted-foreground">{notAssigned}</p>
      ) : null}
    </div>
  )
}

export function CompanyStructureBoard({
  data,
  canEdit,
  labels,
}: {
  data: CompanyStructure
  canEdit: boolean
  labels: {
    notAssigned: string
    save: string
    clear: string
    leaders: string
    outreach: string
    reposters: string
    empty: string
  }
}) {
  return (
    <div className="flex flex-col gap-3">
      {data.executives.map((row) => (
        <ExecutiveRow
          key={row.id}
          id={row.id}
          label={row.label}
          name={row.name}
          notAssigned={labels.notAssigned}
          saveLabel={labels.save}
          clearLabel={labels.clear}
          canEdit={canEdit}
        />
      ))}
      <RoleMembers title={labels.leaders} people={data.leaders} empty={labels.empty} />
      <RoleMembers title={labels.outreach} people={data.outreach} empty={labels.empty} />
      <RoleMembers title={labels.reposters} people={data.reposters} empty={labels.empty} />
    </div>
  )
}
