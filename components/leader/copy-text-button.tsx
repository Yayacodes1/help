'use client'

import { useState } from 'react'
import { Check, ClipboardCopy } from 'lucide-react'

export function CopyTextButton({
  text,
  label,
  copiedLabel,
}: {
  text: string
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
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
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 text-sm font-semibold text-primary hover:bg-primary/20"
    >
      {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
      {copied ? copiedLabel : label}
    </button>
  )
}
