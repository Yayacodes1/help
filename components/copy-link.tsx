'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyLink({
  url,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
}: {
  url: string
  copyLabel?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.top = '-1000px'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      el.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        title={url}
        className="min-w-0 flex-1 truncate text-left font-medium underline underline-offset-4"
        dir="ltr"
      >
        {url}
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? copiedLabel : copyLabel}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent/40"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  )
}
