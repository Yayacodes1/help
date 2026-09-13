import type { CountMode } from '@/lib/db'
import { HOUSE_COMMISSION } from '@/lib/commission'

const inputClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function CommissionTermsFields({
  countMode,
  viewsThreshold,
  viewCommissionAmount,
  commissionReels,
  variant = 'contract',
}: {
  countMode?: CountMode | null
  viewsThreshold?: number | null
  viewCommissionAmount?: number | null
  commissionReels?: number | null
  variant?: 'house' | 'contract'
}) {
  const inherit = variant === 'contract'
  const amountName = inherit ? 'view_commission_amount' : 'commission_amount'
  const reelsName = inherit ? 'commission_reels' : 'reel_count'
  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Commission</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {inherit
            ? 'Pay SAR for every full view-block (e.g. every 5,000 views). 12k views = 2× pay. Leave SAR blank for no commission.'
            : 'Suggested fill-in only — never applied until you set SAR on a contract.'}
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Count how
        <select
          name="count_mode"
          defaultValue={countMode ?? (inherit ? '' : HOUSE_COMMISSION.countMode)}
          className={inputClass}
        >
          {inherit ? <option value="">Suggested · {HOUSE_COMMISSION.countMode}</option> : null}
          <option value="video">Per video</option>
          <option value="batch">Per batch (same clip on IG + TikTok)</option>
        </select>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Views per pay block
          <input
            type="number"
            min={1}
            name="views_threshold"
            defaultValue={viewsThreshold ?? (inherit ? '' : HOUSE_COMMISSION.viewsThreshold)}
            placeholder={inherit ? String(HOUSE_COMMISSION.viewsThreshold) : undefined}
            className={inputClass}
          />
          <span className="text-[10px] text-muted-foreground">
            e.g. every {HOUSE_COMMISSION.viewsThreshold.toLocaleString()} views
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          SAR per block
          <input
            type="number"
            min={0}
            step="0.01"
            name={amountName}
            defaultValue={
              viewCommissionAmount != null
                ? viewCommissionAmount
                : inherit
                  ? ''
                  : HOUSE_COMMISSION.commissionAmount
            }
            placeholder={inherit ? 'No commission' : undefined}
            className={inputClass}
          />
          <span className="text-[10px] text-muted-foreground">
            Paid each time they clear another block
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Expected blocks in deal
          <input
            type="number"
            min={1}
            name={reelsName}
            defaultValue={commissionReels ?? (inherit ? '' : HOUSE_COMMISSION.reelCount)}
            placeholder={inherit ? String(HOUSE_COMMISSION.reelCount) : undefined}
            className={inputClass}
          />
          <span className="text-[10px] text-muted-foreground">
            For “going to do” estimate
          </span>
        </label>
      </div>
    </div>
  )
}
