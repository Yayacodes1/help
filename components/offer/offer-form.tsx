'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { previewCreatorOffer, submitCreatorOffer } from '@/app/actions/creator-offer'
import {
  OFFER_BASE_COUNTRIES,
  OFFER_DIAL_CODES,
  filterOfferCountries,
  normalizeOfferPhone,
} from '@/lib/creator-offer-phone'

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name)
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

async function compressDataUrl(dataUrl: string, max = 1280): Promise<string> {
  const img = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that image.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return canvas.toDataURL('image/jpeg', 0.72)
}

async function framesFromVideo(file: File, count = 8): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('Could not read that video.'))
    })
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that video.')
    const out: string[] = []
    for (let i = 0; i < count; i++) {
      const t = duration * ((i + 0.5) / count)
      video.currentTime = Math.min(duration - 0.05, Math.max(0, t))
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve()
      })
      const max = 1280
      const scale = Math.min(1, max / Math.max(video.videoWidth || 1, video.videoHeight || 1))
      canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * scale))
      canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * scale))
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      out.push(canvas.toDataURL('image/jpeg', 0.72))
    }
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

function buildFormData(input: {
  accountUrl: string
  baseCountry: string
  dial: string
  national: string
  frames: string[]
  interested?: boolean
}) {
  const fd = new FormData()
  fd.set('account_url', input.accountUrl)
  fd.set('base_country', input.baseCountry)
  fd.set('phone_dial', input.dial)
  fd.set('phone_national', input.national)
  fd.set('analytics_frames', JSON.stringify(input.frames))
  if (input.interested) fd.set('interested', '1')
  return fd
}

/** Turn offer markdown-ish text into short readable blocks. */
function offerBlocks(text: string): { title?: string; lines: string[] }[] {
  const blocks: { title?: string; lines: string[] }[] = []
  let current: { title?: string; lines: string[] } = { lines: [] }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      if (current.lines.length || current.title) {
        blocks.push(current)
        current = { lines: [] }
      }
      continue
    }
    const heading = line.match(/^\*\*(.+?)\*\*:?\s*$/)
    if (heading) {
      if (current.lines.length || current.title) blocks.push(current)
      current = { title: heading[1].replace(/:$/, ''), lines: [] }
      continue
    }
    current.lines.push(line.replace(/^\*\*(.+?)\*\*/, '$1').replace(/^[-•]\s*/, ''))
  }
  if (current.lines.length || current.title) blocks.push(current)
  return blocks
}

function CountrySearchSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const selected = OFFER_BASE_COUNTRIES.find((c) => c.value === value) ?? null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const options = useMemo(() => filterOfferCountries(query), [query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? selected.label : 'Select country'}
        </span>
        <span className="text-muted-foreground" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search countries…"
            className="h-10 w-full border-b border-border bg-background px-3 text-sm outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
            ) : (
              options.map((c) => (
                <li key={c.value}>
                  <button
                    type="button"
                    className={`flex w-full px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                      c.value === value ? 'bg-muted/40 font-medium' : ''
                    }`}
                    onClick={() => {
                      onChange(c.value)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    {c.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function CreatorOfferForm() {
  const [pending, startTransition] = useTransition()
  const [accountUrl, setAccountUrl] = useState('')
  const [baseCountry, setBaseCountry] = useState('')
  const [frames, setFrames] = useState<string[]>([])
  const [fileNames, setFileNames] = useState<string[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [uploadRequiredHint, setUploadRequiredHint] = useState(false)
  const [dial, setDial] = useState('')
  const [national, setNational] = useState('')
  const [offerText, setOfferText] = useState('')
  const [termsSummary, setTermsSummary] = useState('')
  const [offerOpen, setOfferOpen] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const phonePreview = useMemo(
    () => (national.trim() && dial ? normalizeOfferPhone(dial, national) : null),
    [dial, national],
  )

  const blocks = useMemo(() => (offerText ? offerBlocks(offerText) : []), [offerText])
  const hasUpload = frames.length > 0

  async function onAnalyticsFiles(fileList: FileList | File[] | null, append = false) {
    setMediaError('')
    setOfferText('')
    setTermsSummary('')
    setOfferOpen(false)
    setStatus(null)
    if (!fileList || (fileList as FileList | File[]).length === 0) {
      if (!append) {
        setFrames([])
        setFileNames([])
      }
      return
    }
    setMediaBusy(true)
    try {
      const collected: string[] = append ? [...frames] : []
      const names: string[] = append ? [...fileNames] : []
      const files = Array.from(fileList as FileList | File[]).slice(0, 6)
      for (const file of files) {
        if (isVideoFile(file)) {
          collected.push(...(await framesFromVideo(file, 8)))
          names.push(file.name || 'screen-recording')
        } else if (isImageFile(file)) {
          collected.push(await compressDataUrl(await fileToDataUrl(file)))
          names.push(file.name || 'screenshot')
        } else {
          setMediaError('Upload photos or a screen recording (image/video).')
          return
        }
      }
      const capped = collected.slice(0, 8)
      if (capped.length === 0) {
        setMediaError('Could not read those files.')
        if (!append) {
          setFrames([])
          setFileNames([])
        }
        return
      }
      setFrames(capped)
      setFileNames(names.slice(0, 6))
    } catch {
      setMediaError('Could not read that file. Try JPG/PNG screenshots or an MP4/MOV recording.')
      if (!append) {
        setFrames([])
        setFileNames([])
      }
    } finally {
      setMediaBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function payload(interested = false) {
    return buildFormData({
      accountUrl,
      baseCountry,
      dial,
      national,
      frames,
      interested,
    })
  }

  function clearUpload() {
    setFrames([])
    setFileNames([])
    setMediaError('')
    setUploadRequiredHint(true)
    setOfferText('')
    setTermsSummary('')
    setOfferOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-4" dir="ltr">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Account link
          <input
            value={accountUrl}
            onChange={(e) => setAccountUrl(e.target.value)}
            required
            placeholder="https://www.tiktok.com/@username"
            dir="ltr"
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Where are you based?</p>
          <CountrySearchSelect value={baseCountry} onChange={setBaseCountry} />
        </div>

        <div className="rounded-xl border border-border/80 bg-muted/20 px-3 py-3">
          <p className="text-sm font-medium text-foreground">How to screen record what we need</p>
          <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Start on your profile</span> so your{' '}
              <span className="text-foreground">@username</span> is clearly visible (same handle as
              the link above).
            </li>
            <li>
              Open <span className="font-medium text-foreground">Analytics</span> (TikTok: Profile →
              Creator tools · Instagram: Professional dashboard).
            </li>
            <li>
              Show <span className="font-medium text-foreground">top 3 audience countries with %</span>{' '}
              and <span className="font-medium text-foreground">age groups</span>.
            </li>
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground">
            No Analytics on TikTok? Settings → Account → Switch to Creator account, then try again.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Upload screen recording or screenshots{' '}
            <span className="font-normal text-destructive">(required)</span>
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.mov,.m4v,.webm"
            multiple
            required
            aria-required="true"
            aria-label="Upload screen recording or screenshots (required)"
            onChange={(e) => {
              setUploadRequiredHint(false)
              void onAnalyticsFiles(e.target.files, frames.length > 0)
            }}
            className="sr-only"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setUploadRequiredHint(false)
              void onAnalyticsFiles(e.dataTransfer.files, frames.length > 0)
            }}
            className={`flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition ${
              uploadRequiredHint && !hasUpload
                ? 'border-destructive bg-destructive/10'
                : hasUpload
                  ? 'border-muted-foreground/30 bg-muted/40'
                  : 'border-border bg-muted/20 hover:border-foreground/40 hover:bg-muted/35'
            }`}
          >
            {mediaBusy ? (
              <p className="text-sm font-semibold text-foreground">Processing…</p>
            ) : hasUpload ? (
              <>
                <p className="text-sm font-semibold text-foreground">Successful drop</p>
                <p className="text-xs text-muted-foreground">You can add more if needed</p>
                <span className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-muted-foreground/25 px-4 text-sm font-semibold text-foreground">
                  Choose more files
                </span>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">Tap to upload</p>
                <p className="text-xs text-muted-foreground">
                  Photos or screen recording · drag & drop works too
                </p>
                <span className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  Choose files
                </span>
              </>
            )}
          </button>

          {fileNames.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Uploaded: {fileNames.join(', ')}
              {' · '}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={clearUpload}
              >
                Clear
              </button>
            </p>
          ) : (
            <p
              className={`text-xs ${uploadRequiredHint ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {uploadRequiredHint
                ? 'Upload is required before we can give you an offer.'
                : 'No file chosen yet.'}
            </p>
          )}

          {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
          {hasUpload ? (
            <div className="grid grid-cols-4 gap-1.5">
              {frames.slice(0, 4).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${i}-${src.slice(0, 24)}`}
                  src={src}
                  alt={`Analytics frame ${i + 1}`}
                  className="h-16 w-full rounded-md object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Country code
            <select
              value={dial}
              onChange={(e) => setDial(e.target.value)}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Select country code</option>
              {OFFER_DIAL_CODES.map((c) => (
                <option key={`${c.iso}-${c.dial}`} value={c.dial}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            WhatsApp number
            <input
              value={national}
              onChange={(e) => setNational(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
              inputMode="numeric"
              placeholder="Local digits only"
              dir="ltr"
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
        </div>
        {phonePreview ? (
          <p className={`text-xs ${phonePreview.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
            {phonePreview.ok ? `Will message ${phonePreview.e164}` : phonePreview.error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pick the country code. Don’t type 00 or the country code in the number field.
          </p>
        )}

        <button
          type="button"
          disabled={pending || mediaBusy}
          onClick={() => {
            setStatus(null)
            setOfferOpen(false)
            setOfferText('')
            setTermsSummary('')
            if (frames.length === 0) {
              setUploadRequiredHint(true)
              setMediaError('Upload is required — add a screen recording or screenshots first.')
              return
            }
            if (!accountUrl.trim()) {
              setStatus({ ok: false, message: 'Paste your TikTok or Instagram profile link.' })
              return
            }
            if (!baseCountry) {
              setStatus({ ok: false, message: 'Select a country for where you are based.' })
              return
            }
            startTransition(async () => {
              const result = await previewCreatorOffer({ ok: false, message: '' }, payload())
              setStatus({ ok: result.ok, message: result.message })
              if (result.ok && result.messageBody) {
                setOfferText(result.messageBody)
                setTermsSummary(result.termsSummary ?? '')
                setOfferOpen(false)
              } else {
                setOfferText('')
                setTermsSummary('')
              }
            })
          }}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && !offerText ? 'Reading your analytics…' : 'Get my offer estimate'}
        </button>

        {status && !status.ok ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </div>

      {offerText && !submitted ? (
        <div className="flex flex-col gap-3">
          {!offerOpen ? (
            <button
              type="button"
              onClick={() => setOfferOpen(true)}
              className="flex w-full flex-col items-center gap-1 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-4 text-center transition hover:bg-emerald-500/15"
            >
              <span className="text-sm font-semibold text-foreground">
                Offer is ready — tap to open
              </span>
              {termsSummary ? (
                <span className="text-xs text-muted-foreground">{termsSummary}</span>
              ) : null}
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Your approximate offer</h2>
                  {termsSummary ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{termsSummary}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOfferOpen(false)}
                  className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
                >
                  Close
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {blocks.map((block, i) => (
                  <div
                    key={`${block.title ?? 'b'}-${i}`}
                    className="rounded-xl bg-muted/35 px-3 py-2.5"
                  >
                    {block.title ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {block.title}
                      </p>
                    ) : null}
                    <ul className={block.title ? 'mt-1.5 space-y-1' : 'space-y-1'}>
                      {block.lines.map((line, j) => (
                        <li key={j} className="text-sm leading-relaxed text-foreground">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Approximation only — not the final contract. If you agree, we’ll WhatsApp you next.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setStatus(null)
                  startTransition(async () => {
                    const result = await submitCreatorOffer(
                      { ok: false, message: '' },
                      payload(true),
                    )
                    setStatus({ ok: result.ok, message: result.message })
                    if (result.ok) setSubmitted(true)
                  })
                }}
                className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {pending ? 'Submitting…' : 'Submit — I’m interested'}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {submitted ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          Thanks — we got your submission. Keep WhatsApp free; we’ll text you if we move forward.
        </div>
      ) : null}
    </div>
  )
}
