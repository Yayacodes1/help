'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

export function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const path = `/submit/${token}`

  async function copy() {
    const url = `${window.location.origin}${path}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        title="Open creator link"
      >
        <ExternalLink className="size-3.5" />
        Open link
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        title="Copy creator link"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  )
}
