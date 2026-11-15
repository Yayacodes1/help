'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveDefaultPayWhenAction, saveCreatorPayWhenAction } from '@/app/actions/admin'

export type PayWhenValue = 'upfront' | 'end' | 'fifteen'

type Labels = {
  question: string
  beforeStart: string
  beforeStartHint: string
  afterEnd: string
  afterEndHint: string
  fifteen?: string
  fifteenHint?: string
  companyDefault: string
  companyDefaultHint: string
  saveDefault: string
  saving: string
  savedBy: string
  unmet: string
  changeForPerson: string
  savePerson: string
}

const DEFAULT_LABELS: Labels = {
  question: 'Should we pay them before the start of the contract, or after the end?',
  beforeStart: 'Before the start',
  beforeStartHint: 'Pay at the start (then every 2 weeks if the contract keeps going).',
  afterEnd: 'After the end',
  afterEndHint: 'One payment when the contract ends.',
  fifteen: 'Every 15 days',
  fifteenHint: 'First pay 15 days after start, last pay at the end (legacy mid-contract).',
  companyDefault: 'Company default (Ahmed)',
  companyDefaultHint:
    'Ahmed usually sets this. It becomes the default for new contracts. Yahya can change it too. Each person can still override.',
  saveDefault: 'Save as company default',
  saving: 'Saving…',
  savedBy: 'Last set by',
  unmet: 'Not set yet — Ahmed (or Yahya) should pick one.',
  changeForPerson: 'For this person',
  savePerson: 'Save for this contract',
}

function radioClass(on: boolean) {
  return `flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
    on
      ? 'border-primary bg-primary/10 text-foreground'
      : 'border-border bg-background hover:bg-accent/40 text-muted-foreground'
  }`
}

function useSyncedWhen(value: PayWhenValue | null) {
  const [picked, setPicked] = useState<PayWhenValue | null>(value)
  useEffect(() => {
    setPicked(value)
  }, [value])
  return [picked, setPicked] as const
}

/** Company-wide default: before start vs after end. */
export function PayWhenDefaultCard({
  value,
  updatedBy,
  labels: labelOverrides,
}: {
  value: 'upfront' | 'end' | null
  updatedBy?: string | null
  labels?: Partial<Labels>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [picked, setPicked] = useSyncedWhen(value)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{labels.companyDefault}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{labels.companyDefaultHint}</p>
      <p className="mt-3 text-sm font-medium text-foreground">{labels.question}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className={radioClass(picked === 'upfront')}>
          <input
            type="radio"
            name="company_pay_when"
            value="upfront"
            checked={picked === 'upfront'}
            onChange={() => setPicked('upfront')}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-foreground">{labels.beforeStart}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {labels.beforeStartHint}
            </span>
          </span>
        </label>
        <label className={radioClass(picked === 'end')}>
          <input
            type="radio"
            name="company_pay_when"
            value="end"
            checked={picked === 'end'}
            onChange={() => setPicked('end')}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-foreground">{labels.afterEnd}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{labels.afterEndHint}</span>
          </span>
        </label>
      </div>
      {!value ? (
        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{labels.unmet}</p>
      ) : updatedBy ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {labels.savedBy} {updatedBy}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending || !picked}
        onClick={() => {
          if (picked !== 'upfront' && picked !== 'end') return
          startTransition(() => {
            void saveDefaultPayWhenAction(picked).then(() => router.refresh())
          })
        }}
        className="mt-3 h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? labels.saving : labels.saveDefault}
      </button>
    </div>
  )
}

/** Per-contract answer on Payments / Contracts. Uses form radios when embedded in a form. */
export function PayWhenQuestion({
  value,
  defaultWhen = null,
  name = 'pay_timing',
  showFifteen = true,
  creatorId,
  contractId,
  standalone = false,
  labels: labelOverrides,
}: {
  value?: PayWhenValue | null
  /** Company default used when this contract has no timing yet. */
  defaultWhen?: 'upfront' | 'end' | null
  name?: string
  showFifteen?: boolean
  creatorId?: number
  contractId?: number | null
  /** When true, saves via action instead of relying on a parent form. */
  standalone?: boolean
  labels?: Partial<Labels>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const initial: PayWhenValue | null =
    value === 'upfront' || value === 'end' || value === 'fifteen'
      ? value
      : defaultWhen === 'upfront' || defaultWhen === 'end'
        ? defaultWhen
        : null
  const [picked, setPicked] = useSyncedWhen(initial)

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
      <p className="text-sm font-medium text-foreground">{labels.question}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{labels.changeForPerson}</p>
      <div className="mt-2 grid gap-2">
        <label className={radioClass(picked === 'upfront')}>
          <input
            type="radio"
            name={name}
            value="upfront"
            checked={picked === 'upfront'}
            onChange={() => setPicked('upfront')}
            required={!picked}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-foreground">{labels.beforeStart}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {labels.beforeStartHint}
            </span>
          </span>
        </label>
        <label className={radioClass(picked === 'end')}>
          <input
            type="radio"
            name={name}
            value="end"
            checked={picked === 'end'}
            onChange={() => setPicked('end')}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-foreground">{labels.afterEnd}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{labels.afterEndHint}</span>
          </span>
        </label>
        {showFifteen && (value === 'fifteen' || picked === 'fifteen') ? (
          <label className={radioClass(picked === 'fifteen')}>
            <input
              type="radio"
              name={name}
              value="fifteen"
              checked={picked === 'fifteen'}
              onChange={() => setPicked('fifteen')}
              className="mt-1"
            />
            <span>
              <span className="font-semibold text-foreground">
                {labels.fifteen ?? 'Every 15 days'}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {labels.fifteenHint}
              </span>
            </span>
          </label>
        ) : null}
      </div>
      {!picked ? (
        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{labels.unmet}</p>
      ) : null}
      {standalone && creatorId != null && contractId != null ? (
        <button
          type="button"
          disabled={pending || !picked}
          onClick={() => {
            if (!picked) return
            startTransition(() => {
              void saveCreatorPayWhenAction(creatorId, contractId, picked).then(() =>
                router.refresh(),
              )
            })
          }}
          className="mt-3 h-9 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-accent disabled:opacity-60"
        >
          {pending ? labels.saving : labels.savePerson}
        </button>
      ) : null}
    </div>
  )
}
