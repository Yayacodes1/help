'use client'

import { useState, useTransition } from 'react'
import {
  adminRegenerateCreatorOffer,
  adminSetCreatorOfferStatus,
  adminWhatsAppCreatorOffer,
} from '@/app/actions/creator-offer'
import type { CreatorOfferRow } from '@/lib/creator-offer-db'
import { formatDateTime } from '@/lib/format'

export function CreatorOffersBoard({ offers }: { offers: CreatorOfferRow[] }) {
  const [pending, startTransition] = useTransition()
  const [cpmById, setCpmById] = useState<Record<number, string>>({})
  const [note, setNote] = useState<string | null>(null)

  if (offers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No offer submissions yet. Share <span className="font-medium text-foreground">/offer</span>{' '}
        with creators.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      <ul className="flex flex-col gap-3">
        {offers.map((row) => {
          const cpm =
            cpmById[row.id] ??
            (row.targetCpm != null
              ? String(row.targetCpm)
              : row.termsJson.estimatedCpm != null
                ? String(row.termsJson.estimatedCpm)
                : '0.6')
          const backgroundCpm =
            row.termsJson.estimatedCpm != null
              ? `${row.currency === 'USD' ? '$' : ''}${row.termsJson.estimatedCpm}${
                  row.currency === 'SAR' ? ' SAR' : ''
                } CPM-ish`
              : row.targetCpm != null
                ? `target $${row.targetCpm}`
                : '—'
          return (
            <li key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={row.accountUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold hover:underline"
                    >
                      {row.username ? `@${row.username}` : row.accountUrl}
                    </a>
                    <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {row.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {row.platform ?? '—'} · {row.baseCountry}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)} · WhatsApp {row.whatsappPhone}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Likes" value={row.likes?.toLocaleString() ?? '—'} />
                <Stat label="Followers" value={row.followers?.toLocaleString() ?? '—'} />
                <Stat label="Avg views" value={row.avgViews != null ? Math.round(row.avgViews).toLocaleString() : '—'} />
                <Stat
                  label="Median views"
                  value={row.medianViews != null ? Math.round(row.medianViews).toLocaleString() : '—'}
                />
                <Stat label="Videos" value={row.videoCount != null ? `${row.videoCount} (last posts)` : '—'} />
                <Stat
                  label="Top countries"
                  value={
                    row.audienceCountries.length > 0
                      ? row.audienceCountries
                          .map((c) =>
                            c.percent != null ? `${c.country} ${c.percent}%` : c.country,
                          )
                          .join(' · ')
                      : (row.audienceCountry ?? '—')
                  }
                />
                <Stat label="Audience age" value={row.audienceAge ?? '—'} />
                <Stat label="Based / market" value={`${row.baseCountry} · ${row.market} · ${row.currency}`} />
                <Stat label="Background CPM" value={backgroundCpm} />
              </div>

              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
                {row.offerMessage}
              </pre>

              {row.frameImages.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {row.frameImages.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt={`Frame ${i + 1}`}
                      className="h-24 w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                  Target CPM (USD)
                  <input
                    value={cpm}
                    onChange={(e) => setCpmById((m) => ({ ...m, [row.id]: e.target.value }))}
                    className="h-9 w-28 rounded-lg border border-input bg-background px-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await adminRegenerateCreatorOffer(row.id, cpm)
                      setNote(
                        result.ok
                          ? `Regenerated offer #${row.id} at $${cpm} CPM.`
                          : result.message,
                      )
                    })
                  }
                  className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  Regenerate offer
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await adminWhatsAppCreatorOffer(row.id)
                      if (!result.ok) {
                        setNote(result.message)
                        return
                      }
                      window.open(result.url, '_blank', 'noopener,noreferrer')
                      setNote(`Opened WhatsApp for #${row.id}.`)
                    })
                  }
                  className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  Text them on WhatsApp
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await adminSetCreatorOfferStatus(row.id, 'interested')
                      setNote(`Marked #${row.id} interested.`)
                    })
                  }
                  className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-60"
                >
                  They agreed
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await adminSetCreatorOfferStatus(row.id, 'passed')
                      setNote(`Marked #${row.id} passed.`)
                    })
                  }
                  className="h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
                >
                  Not moving forward
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{value}</div>
    </div>
  )
}
