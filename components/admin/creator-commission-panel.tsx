'use client'

import { Suspense, useMemo, useState } from 'react'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { saveContractCommission, setContractCommissionPaid } from '@/app/actions/admin'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import { idsOnPage } from '@/lib/refresh-scope'
import type {
  CommissionContractSheet,
  CommissionOutsideSheet,
  CommissionVideoLine,
} from '@/lib/commission-data'

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

const TARGET_HINT =
  'Tap contracts to select more than one. Totals and videos combine across your picks; rates and paid stay per contract.'

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

function sheetLines(sheet: CommissionContractSheet) {
  const threshold = sheet.viewsThreshold && sheet.viewsThreshold > 0 ? sheet.viewsThreshold : null
  const amount = sheet.commissionAmount
  if (threshold == null || amount == null) return []
  return sheet.videos
    .map((video) => qualify(video, threshold, amount))
    .filter((video) => video.chunks > 0)
    .map((video) => ({
      ...video,
      contractId: sheet.id,
      contractName: sheet.name,
      threshold,
    }))
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
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold">{sheet.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(sheet.startDate)}
          {sheet.endDate ? ` → ${formatDate(sheet.endDate)}` : ' → open'}
        </p>
      </div>

      <form action={saveContractCommission.bind(null, sheet.id)} className="rounded-lg border border-border bg-background p-3">
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

      <section>
        <p className="text-xs text-muted-foreground">Commission for this contract</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{rateReady ? formatMoney(total, 'SAR') : '—'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {lines.length} {lines.length === 1 ? 'video' : 'videos'} qualified
        </p>
        <form action={setContractCommissionPaid.bind(null, sheet.id)} className="mt-3">
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
                      {video.platform === 'instagram' ? 'IG' : video.platform === 'youtube' ? 'YT' : 'TT'}
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
  refreshAllLabel = 'Refresh all views',
}: {
  creatorId: number
  sheets: CommissionContractSheet[]
  outside: CommissionOutsideSheet
  refreshFrom: string
  refreshTo: string
  refreshLabel: string
  refreshAllLabel?: string
}) {
  const initial = sheets.find((sheet) => sheet.isActive)?.id ?? sheets[sheets.length - 1]?.id ?? null
  const [selectedIds, setSelectedIds] = useState<number[]>(() => (initial != null ? [initial] : []))

  const selected = useMemo(
    () => sheets.filter((sheet) => selectedIds.includes(sheet.id)),
    [sheets, selectedIds],
  )

  const combinedLines = useMemo(() => {
    const lines = selected.flatMap(sheetLines)
    lines.sort((a, b) => {
      const da = a.videoDate ?? ''
      const db = b.videoDate ?? ''
      if (da !== db) return db.localeCompare(da)
      return b.views - a.views
    })
    return lines
  }, [selected])

  const combinedTotal =
    Math.round(combinedLines.reduce((sum, video) => sum + video.sar, 0) * 100) / 100
  const combinedEarned =
    Math.round(selected.reduce((sum, sheet) => sum + sheet.earnedSar, 0) * 100) / 100

  const refreshRange = useMemo(() => {
    if (selected.length === 0) return { from: refreshFrom, to: refreshTo }
    const starts = selected.map((s) => s.startDate).sort()
    const ends = selected.map((s) => s.endDate ?? refreshTo).sort()
    return { from: starts[0] ?? refreshFrom, to: ends[ends.length - 1] ?? refreshTo }
  }, [selected, refreshFrom, refreshTo])

  function toggle(id: number) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }

  function selectAll() {
    setSelectedIds(sheets.map((s) => s.id))
  }

  function selectActiveOnly() {
    const active = sheets.find((s) => s.isActive)
    if (active) setSelectedIds([active.id])
    else if (sheets.length > 0) setSelectedIds([sheets[sheets.length - 1]!.id])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{TARGET_HINT}</p>
        <Suspense fallback={<p className="text-xs text-muted-foreground">Loading refresh…</p>}>
          <RefreshViewsButton
            key={`${creatorId}-${selectedIds.join('-')}`}
            label={refreshLabel}
            allLabel={refreshAllLabel}
            creatorId={creatorId}
            defaultFrom={refreshRange.from}
            defaultTo={refreshRange.to}
            submissionIds={idsOnPage(selected.flatMap((s) => s.videos))}
          />
        </Suspense>
      </div>

      {sheets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No contracts yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent"
            >
              All ({sheets.length})
            </button>
            <button
              type="button"
              onClick={selectActiveOnly}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent"
            >
              Active only
            </button>
            <span className="text-xs text-muted-foreground">
              {selected.length} selected
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Contracts">
            {sheets.map((sheet) => {
              const on = selectedIds.includes(sheet.id)
              const label =
                sheet.commissionAmount == null
                  ? 'No rate'
                  : formatMoney(sheet.earnedSar, 'SAR')
              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => toggle(sheet.id)}
                  aria-pressed={on}
                  className={`min-w-[11rem] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40'
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

          {selected.length > 1 ? (
            <section className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Combined across selected contracts</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {formatMoney(combinedLines.length > 0 ? combinedTotal : combinedEarned, 'SAR')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.length} contracts · {combinedLines.length}{' '}
                {combinedLines.length === 1 ? 'video' : 'videos'} qualified
              </p>
              {combinedLines.length > 0 ? (
                <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                  {combinedLines.map((video) => (
                    <li key={`${video.contractId}-${video.id}`} className="px-3 py-2.5 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium">
                          {video.videoDate ? formatDate(video.videoDate) : '—'}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {video.platform === 'instagram' ? 'IG' : 'TT'} · {video.contractName}
                          </span>
                        </p>
                        <p className="shrink-0 tabular-nums font-semibold">{formatMoney(video.sar, 'SAR')}</p>
                      </div>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatNumber(video.views)} views · {video.chunks} × {formatNumber(video.threshold)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No qualified videos yet on the selected contracts (save a rate on each to count).
                </p>
              )}
            </section>
          ) : null}

          <div className="flex flex-col gap-4">
            {selected.map((sheet) => (
              <PeriodDetail key={sheet.id} sheet={sheet} />
            ))}
          </div>
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
