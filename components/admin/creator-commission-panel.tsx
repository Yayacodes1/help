'use client'

import { Suspense, useState } from 'react'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { saveContractCommission, setContractCommissionPaid } from '@/app/actions/admin'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import type {
  CommissionContractSheet,
  CommissionOutsideSheet,
  CommissionVideoLine,
} from '@/lib/commission-data'

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function qualify(video: CommissionVideoLine, threshold: number, amount: number) {
  const chunks = threshold > 0 ? Math.floor(Math.max(0, video.views) / threshold) : 0
  const remainder = threshold > 0 ? Math.max(0, video.views) % threshold : 0
  return {
    ...video,
    chunks,
    remainder,
    sar: Math.round(chunks * amount * 100) / 100,
  }
}

function PeriodDetail({ sheet }: { sheet: CommissionContractSheet }) {
  const [thresholdText, setThresholdText] = useState(String(sheet.viewsThreshold ?? 5000))
  const [amountText, setAmountText] = useState(
    sheet.commissionAmount == null ? '5' : String(sheet.commissionAmount),
  )
  const threshold = Math.floor(Number(thresholdText))
  const amount = Number(amountText)
  const rateReady = Number.isFinite(threshold) && threshold > 0 && Number.isFinite(amount) && amount >= 0
  const savedThreshold = sheet.viewsThreshold && sheet.viewsThreshold > 0 ? sheet.viewsThreshold : null
  const savedAmount = sheet.commissionAmount
  const rateSaved =
    savedAmount != null &&
    savedThreshold != null &&
    savedThreshold === threshold &&
    savedAmount === amount
  const lines = rateReady
    ? sheet.videos.map((video) => qualify(video, threshold, amount)).filter((video) => video.chunks > 0)
    : []
  const total = Math.round(lines.reduce((sum, video) => sum + video.sar, 0) * 100) / 100
  const paid = sheet.paidOn != null

  return (
    <div className="flex flex-col gap-4">
      <form action={saveContractCommission.bind(null, sheet.id)} className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Commission rate</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Saudi riyals. Each video is counted alone. The first block pays once, and every extra block on that same video pays again.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Views
            <input
              type="number"
              min={1}
              name="views_threshold"
              value={thresholdText}
              onChange={(e) => setThresholdText(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Saudi riyals for those views
            <input
              type="number"
              min={0}
              step="0.01"
              name="view_commission_amount"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Save rate
          </button>
        </div>
        <p className="mt-3 text-sm">
          {rateReady ? (
            <>
              Every {formatNumber(threshold)} views pays {formatMoney(amount, 'SAR')}.
              {rateSaved ? ' Saved on this contract.' : ' Save it on this contract to keep the numbers.'}
            </>
          ) : (
            'Enter the views and the riyals.'
          )}
        </p>
      </form>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Commission for this contract</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{rateReady ? formatMoney(total, 'SAR') : '—'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {lines.length} {lines.length === 1 ? 'video' : 'videos'} qualified
        </p>
        <form action={setContractCommissionPaid.bind(null, sheet.id)} className="mt-4">
          <input type="hidden" name="paid" value={paid ? '0' : '1'} />
          <input type="hidden" name="amount" value={rateSaved ? total : sheet.earnedSar} />
          <button
            type="submit"
            disabled={!paid && !rateSaved}
            className={`h-11 rounded-lg px-4 text-sm font-semibold ${
              paid
                ? 'bg-primary text-primary-foreground'
                : 'bg-foreground text-background disabled:opacity-40'
            }`}
          >
            {paid
              ? `Paid ${formatMoney(sheet.paidAmount ?? 0, 'SAR')}`
              : `Confirm paid ${rateReady ? formatMoney(total, 'SAR') : ''}`}
          </button>
          {paid && sheet.paidOn ? (
            <p className="mt-2 text-xs text-muted-foreground">Saved {formatDate(sheet.paidOn)}. Press again to undo.</p>
          ) : !rateSaved ? (
            <p className="mt-2 text-xs text-muted-foreground">Save the rate, then confirm the amount you are paying.</p>
          ) : null}
        </form>
      </section>

      <section>
        <h3 className="text-sm font-semibold">Videos that qualified</h3>
        {lines.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {rateReady
              ? `No video on this contract has reached ${formatNumber(threshold)} views.`
              : 'Set the rate to see which videos qualify.'}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {lines.map((video) => (
              <li key={video.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {video.videoDate ? formatDate(video.videoDate) : '—'}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {video.platform === 'instagram' ? 'IG' : 'TT'}
                    </span>
                  </p>
                  <p className="shrink-0 tabular-nums font-semibold">{formatMoney(video.sar, 'SAR')}</p>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatNumber(video.views)} views · {video.chunks} × {formatNumber(threshold)}
                  {video.remainder > 0 ? ` · ${formatNumber(video.remainder)} toward the next` : ''}
                  {video.url ? (
                    <>
                      {' · '}
                      <a href={video.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        open
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function CreatorCommissionPanel({
  creatorId,
  sheets,
  outside,
  refreshFrom,
  refreshTo,
  refreshLabel,
}: {
  creatorId: number
  sheets: CommissionContractSheet[]
  outside: CommissionOutsideSheet
  refreshFrom: string
  refreshTo: string
  refreshLabel: string
}) {
  const initial = sheets.find((sheet) => sheet.isActive)?.id ?? sheets[sheets.length - 1]?.id ?? null
  const [selectedId, setSelectedId] = useState<number | null>(initial)
  const selected = sheets.find((sheet) => sheet.id === selectedId) ?? sheets[0] ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Pick a contract period. The rate and the paid mark stay on that contract.</p>
        <Suspense fallback={<p className="text-xs text-muted-foreground">Loading refresh…</p>}>
          <RefreshViewsButton
            label={refreshLabel}
            creatorId={creatorId}
            defaultFrom={selected?.startDate ?? refreshFrom}
            defaultTo={selected?.endDate ?? refreshTo}
          />
        </Suspense>
      </div>

      {sheets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No contracts yet.
        </p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sheets.map((sheet) => {
              const on = sheet.id === selected?.id
              const label =
                sheet.commissionAmount == null
                  ? 'No rate'
                  : formatMoney(sheet.earnedSar, 'SAR')
              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => setSelectedId(sheet.id)}
                  aria-pressed={on}
                  className={`min-w-[11rem] shrink-0 rounded-xl border px-3 py-2 text-left ${
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
                  }`}
                >
                  <span className="block text-sm font-semibold">{sheet.name}</span>
                  <span className={`mt-0.5 block text-[11px] ${on ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {formatDate(sheet.startDate)}
                    {sheet.endDate ? ` → ${formatDate(sheet.endDate)}` : ' → open'}
                  </span>
                  <span className="mt-1 block text-sm font-semibold tabular-nums">
                    {label}
                    {sheet.paidOn ? ' · Paid' : ''}
                  </span>
                </button>
              )
            })}
          </div>
          {selected ? <PeriodDetail key={selected.id} sheet={selected} /> : null}
        </>
      )}

      {outside.approvedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {outside.approvedCount} {outside.approvedCount === 1 ? 'video falls' : 'videos fall'} outside these contract dates, so {outside.approvedCount === 1 ? 'it is' : 'they are'} not in a period yet.
        </p>
      ) : null}
    </div>
  )
}
