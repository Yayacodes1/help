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
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const phonePreview = useMemo(
    () => (national.trim() && dial ? normalizeOfferPhone(dial, national) : null),
    [dial, national],
  )

  async function onAnalyticsFiles(fileList: FileList | File[] | null, append = false) {
    setMediaError('')
    setOfferText('')
    setTermsSummary('')
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Account link
          <span className="text-xs font-normal text-muted-foreground">
            Your TikTok or Instagram profile URL.
          </span>
          <input
            value={accountUrl}
            onChange={(e) => setAccountUrl(e.target.value)}
            required
            placeholder="https://www.tiktok.com/@username"
            dir="ltr"
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Where are you based?</p>
          <p className="text-xs text-muted-foreground">
            Where you live — used for compensation. Audience countries come from your analytics
            upload.
          </p>
          <CountrySearchSelect value={baseCountry} onChange={setBaseCountry} />
        </div>

        <div className="rounded-xl border border-border/80 bg-muted/20 px-3 py-3 text-sm leading-relaxed">
          <p className="font-medium text-foreground">How to get the info we need before you upload</p>
          <p className="mt-1 text-xs text-muted-foreground">
            We pull your last 10 videos from the account link for average / median views. The
            recording is for audience (top countries % + age).
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Prove the account:</span> start on your
              profile so your <span className="text-foreground">@username</span> is clearly visible
              (same handle as the link above).
            </li>
            <li>
              <span className="font-medium text-foreground">Open analytics:</span> TikTok → Profile →
              Creator tools / Analytics (or Instagram Professional dashboard).
            </li>
            <li>
              <span className="font-medium text-foreground">Audience countries:</span> open Followers
              / Audience and show the <span className="text-foreground">top 3 countries with %</span>
              .
            </li>
            <li>
              <span className="font-medium text-foreground">Age:</span> show{' '}
              <span className="text-foreground">age groups</span> on the same audience screens.
            </li>
          </ol>
          <p className="mt-3 text-[11px] text-muted-foreground">
            TikTok tip: if you don’t see Analytics, switch to a Creator account under Settings →
            Account → Switch to Creator account, then reopen Profile → Creator tools.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              Upload screen recording or screenshots{' '}
              <span className="font-normal text-destructive">(required)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Required — profile @username, then audience top countries with % and age groups.
            </p>
          </div>

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
            className={`flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition hover:border-foreground/40 hover:bg-muted/35 ${
              uploadRequiredHint && frames.length === 0
                ? 'border-destructive bg-destructive/10'
                : frames.length > 0
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-border bg-muted/20'
            }`}
          >
            <p className="text-sm font-semibold text-foreground">
              {mediaBusy
                ? 'Processing…'
                : frames.length > 0
                  ? 'Add more photos or another recording'
                  : 'Tap to upload'}
            </p>
            <p className="text-xs text-muted-foreground">
              Photos or screen recording · drag & drop works too
            </p>
            <span className="mt-1 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
              {frames.length > 0 ? 'Choose more files' : 'Choose files'}
            </span>
          </button>

          {fileNames.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Uploaded: {fileNames.join(', ')}
              {' · '}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  setFrames([])
                  setFileNames([])
                  setMediaError('')
                  setUploadRequiredHint(true)
                  setOfferText('')
                  setTermsSummary('')
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
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
          {frames.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {frames.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${i}-${src.slice(0, 24)}`}
                  src={src}
                  alt={`Analytics frame ${i + 1}`}
                  className="h-28 w-full rounded-lg object-cover"
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
              } else {
                setOfferText('')
                setTermsSummary('')
              }
            })
          }}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? 'Reading your analytics…' : 'Get my offer estimate'}
        </button>

        {status ? (
          <p className={`text-sm ${status.ok ? 'text-foreground' : 'text-destructive'}`}>
            {status.message}
            {status.ok && termsSummary ? ` · ${termsSummary}` : ''}
          </p>
        ) : null}
      </div>

      {offerText && !submitted ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Your approximate offer</h2>
          <pre className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm leading-relaxed">
            {offerText}
          </pre>
          <p className="text-xs text-muted-foreground">
            This is an approximation — not the final contract. If you agree, we’ll WhatsApp you next.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setStatus(null)
              startTransition(async () => {
                const result = await submitCreatorOffer({ ok: false, message: '' }, payload(true))
                setStatus({ ok: result.ok, message: result.message })
                if (result.ok) setSubmitted(true)
              })
            }}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? 'Submitting…' : 'Submit — I’m interested'}
          </button>
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
