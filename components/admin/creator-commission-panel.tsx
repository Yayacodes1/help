'use client'

import { Suspense } from 'react'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { saveContractCommission, setContractCommissionPaid } from '@/app/actions/admin'
import { RefreshViewsButton } from '@/components/admin/refresh-views-button'
import type {
  CommissionContractSheet,
  CommissionOutsideSheet,
  CommissionVideoLine,
} from '@/lib/commission-data'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function VideoRow({ video, threshold, amount }: { video: CommissionVideoLine; threshold: number; amount: number | null }) {
  const platform = video.platform === 'instagram' ? 'IG' : 'TT'
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">
          {video.videoDate ? formatDate(video.videoDate) : '—'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{platform}</span>
        </p>
        <p className="shrink-0 tabular-nums font-semibold">
          {amount == null ? '—' : formatMoney(video.sar, 'SAR')}
        </p>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {formatNumber(video.views)} views
        {video.chunks > 0
          ? ` · ${video.chunks} × ${formatNumber(threshold)}`
          : ` · under ${formatNumber(threshold)}`}
        {video.chunks > 0 && video.remainder > 0
          ? ` · ${formatNumber(video.remainder)} toward the next`
          : ''}
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
  )
}

function ContractColumn({ sheet }: { sheet: CommissionContractSheet }) {
  const threshold = sheet.viewsThreshold && sheet.viewsThreshold > 0 ? sheet.viewsThreshold : 5000
  const amount = sheet.commissionAmount
  const approved = sheet.videos.filter((v) => v.chunks > 0)
  const waiting = sheet.videos.filter((v) => v.chunks === 0)
  const saved = sheet.paidOn != null

  return (
    <article className="flex min-w-[18rem] flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{sheet.name}</h3>
          {sheet.isActive ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Current
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(sheet.startDate)}
          {sheet.endDate ? ` → ${formatDate(sheet.endDate)}` : ' → open'}
        </p>
      </header>

      <form action={saveContractCommission.bind(null, sheet.id)} className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Views per block
          <input
            type="number"
            min={1}
            name="views_threshold"
            defaultValue={sheet.viewsThreshold ?? 5000}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          SAR per block
          <input
            type="number"
            min={0}
            step="0.01"
            name="view_commission_amount"
            defaultValue={sheet.commissionAmount ?? 5}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="col-span-2 h-9 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        >
          Save rate
        </button>
      </form>
      <p className="text-[11px] text-muted-foreground">
        Each video is counted alone. {formatNumber(threshold)} views ={' '}
        {amount == null ? 'set SAR' : formatMoney(amount, 'SAR')}, then the next{' '}
        {formatNumber(threshold)} views pay again.
      </p>

      <div className="rounded-lg border border-border px-3 py-2">
        <p className="text-lg font-semibold tabular-nums">{formatMoney(sheet.earnedSar, 'SAR')}</p>
        <p className="text-[11px] text-muted-foreground">
          {sheet.approvedCount} approved {sheet.approvedCount === 1 ? 'video' : 'videos'}
          {' · '}
          {sheet.blockCount} {sheet.blockCount === 1 ? 'block' : 'blocks'}
        </p>
      </div>

      <form action={setContractCommissionPaid.bind(null, sheet.id)}>
        <input type="hidden" name="paid" value={saved ? '0' : '1'} />
        <input type="hidden" name="amount" value={sheet.earnedSar} />
        <button
          type="submit"
          aria-pressed={saved}
          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
            saved ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
          }`}
        >
          <span className="inline-flex size-4 items-center justify-center rounded border border-current text-xs">
            {saved ? '✓' : ''}
          </span>
          <span>
            {saved ? 'Paid' : 'Mark as paid'}
            {saved && sheet.paidOn ? (
              <span className={`mt-0.5 block text-[11px] ${saved ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                Saved {formatDate(sheet.paidOn)}
                {sheet.paidAmount != null ? ` · ${formatMoney(sheet.paidAmount, 'SAR')}` : ''}
              </span>
            ) : (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">Stays checked after you send it</span>
            )}
          </span>
        </button>
      </form>

      <div>
        <h4 className="px-1 text-xs font-semibold">Approved for commission</h4>
        {approved.length === 0 ? (
          <p className="mt-1 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            No video has reached {formatNumber(threshold)} views on this contract yet.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {approved.map((video) => (
              <VideoRow key={video.id} video={video} threshold={threshold} amount={amount} />
            ))}
          </ul>
        )}
      </div>

      {waiting.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer px-1">
            {waiting.length} {waiting.length === 1 ? 'video' : 'videos'} still under {formatNumber(threshold)}
          </summary>
          <ul className="mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {waiting.map((video) => (
              <VideoRow key={video.id} video={video} threshold={threshold} amount={amount} />
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  )
}

function OutsideColumn({ sheet }: { sheet: CommissionOutsideSheet }) {
  const approved = sheet.videos.filter((v) => v.chunks > 0)
  const waiting = sheet.videos.filter((v) => v.chunks === 0)
  if (sheet.videos.length === 0) return null
  return (
    <article className="flex min-w-[18rem] flex-1 flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-3">
      <header>
        <h3 className="text-sm font-semibold">Not on a contract</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          These dates fall outside every contract. Counted at{' '}
          {formatNumber(sheet.viewsThreshold)} views ={' '}
          {sheet.commissionAmount == null ? 'set a rate on a contract' : formatMoney(sheet.commissionAmount, 'SAR')}
          , each video alone. The paid check is saved on a contract.
        </p>
      </header>
      <div className="rounded-lg border border-border px-3 py-2">
        <p className="text-lg font-semibold tabular-nums">{formatMoney(sheet.earnedSar, 'SAR')}</p>
        <p className="text-[11px] text-muted-foreground">
          {sheet.approvedCount} approved {sheet.approvedCount === 1 ? 'video' : 'videos'}
          {' · '}
          {sheet.blockCount} {sheet.blockCount === 1 ? 'block' : 'blocks'}
        </p>
      </div>
      <div>
        <h4 className="px-1 text-xs font-semibold">Approved for commission</h4>
        {approved.length === 0 ? (
          <p className="mt-1 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            No video has reached {formatNumber(sheet.viewsThreshold)} views yet.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {approved.map((video) => (
              <VideoRow
                key={video.id}
                video={video}
                threshold={sheet.viewsThreshold}
                amount={sheet.commissionAmount}
              />
            ))}
          </ul>
        )}
      </div>
      {waiting.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer px-1">
            {waiting.length} {waiting.length === 1 ? 'video' : 'videos'} still under{' '}
            {formatNumber(sheet.viewsThreshold)}
          </summary>
          <ul className="mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {waiting.map((video) => (
              <VideoRow
                key={video.id}
                video={video}
                threshold={sheet.viewsThreshold}
                amount={sheet.commissionAmount}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </article>
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
  const earned = sheets.reduce((sum, s) => sum + s.earnedSar, 0) + outside.earnedSar
  const unpaid =
    sheets.filter((s) => s.paidOn == null).reduce((sum, s) => sum + s.earnedSar, 0) + outside.earnedSar

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm tabular-nums">
          <span className="font-semibold">{formatMoney(earned, 'SAR')}</span>
          <span className="text-muted-foreground"> earned</span>
          {' · '}
          <span className="font-semibold">{formatMoney(unpaid, 'SAR')}</span>
          <span className="text-muted-foreground"> not marked paid</span>
        </p>
        <Suspense fallback={<p className="text-xs text-muted-foreground">Loading refresh…</p>}>
          <RefreshViewsButton
            label={refreshLabel}
            creatorId={creatorId}
            defaultFrom={refreshFrom}
            defaultTo={refreshTo}
          />
        </Suspense>
      </div>

      {sheets.length === 0 && outside.videos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No contracts yet.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {sheets.map((sheet) => (
            <ContractColumn key={sheet.id} sheet={sheet} />
          ))}
          <OutsideColumn sheet={outside} />
        </div>
      )}
    </div>
  )
}
