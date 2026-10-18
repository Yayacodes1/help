'use client'

import { saveLeaderCheck } from '@/app/actions/leader'

export function CheckForm({
  creatorId,
  day,
  checked,
  note,
  markLabel,
  undoLabel,
  saveLabel,
  notePlaceholder,
  compact = false,
  action = saveLeaderCheck,
  extraFields,
}: {
  creatorId: number
  day: string
  checked: boolean
  note: string | null
  markLabel: string
  undoLabel: string
  saveLabel: string
  notePlaceholder: string
  compact?: boolean
  action?: (formData: FormData) => void | Promise<void>
  extraFields?: Record<string, string>
}) {
  const extras = extraFields
    ? Object.entries(extraFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))
    : null

  if (compact) {
    return (
      <form action={action}>
        {extras}
        <input type="hidden" name="creator_id" value={creatorId} />
        <input type="hidden" name="day" value={day} />
        <input type="hidden" name="keep_note" value="1" />
        <input type="hidden" name="checked" value={checked ? '0' : '1'} />
        <button
          type="submit"
          aria-pressed={checked}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-semibold ${
            checked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40'
          }`}
          title={checked ? undoLabel : markLabel}
        >
          {checked ? '✓' : '○'}
        </button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-col gap-2">
        {extras}
        <input type="hidden" name="creator_id" value={creatorId} />
        <input type="hidden" name="day" value={day} />
        <input type="hidden" name="checked" value="1" />
        <textarea
          name="note"
          defaultValue={note ?? ''}
          rows={3}
          placeholder={notePlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {checked ? saveLabel : markLabel}
        </button>
      </form>
      {checked ? (
        <form action={action}>
          {extras}
          <input type="hidden" name="creator_id" value={creatorId} />
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="checked" value="0" />
          <button type="submit" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
            {undoLabel}
          </button>
        </form>
      ) : null}
    </div>
  )
}
