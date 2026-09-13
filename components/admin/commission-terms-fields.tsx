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
    <div className="grid gap-2">
      <p className="text-[11px] text-muted-foreground">
        View commission.{' '}
        {inherit
          ? 'Leave $ blank for no commission on this contract. Fill $ (and optionally views / reels / count) to assign it.'
          : 'Suggested fill-in only — never applied until you set commission $ on a contract.'}
      </p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Count
        <select
          name="count_mode"
          defaultValue={countMode ?? (inherit ? '' : HOUSE_COMMISSION.countMode)}
          className={inputClass}
        >
          {inherit ? <option value="">Suggested fill-in</option> : null}
          <option value="video">Per video</option>
          <option value="batch">Per batch (same clip on IG + TikTok)</option>
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Views to qualify
          <input
            type="number"
            min={1}
            name="views_threshold"
            defaultValue={viewsThreshold ?? (inherit ? '' : HOUSE_COMMISSION.viewsThreshold)}
            placeholder={inherit ? String(HOUSE_COMMISSION.viewsThreshold) : undefined}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          $ for that deal
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
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Reels in deal
          <input
            type="number"
            min={1}
            name={reelsName}
            defaultValue={commissionReels ?? (inherit ? '' : HOUSE_COMMISSION.reelCount)}
            placeholder={inherit ? String(HOUSE_COMMISSION.reelCount) : undefined}
            className={inputClass}
          />
        </label>
      </div>
    </div>
  )
}
