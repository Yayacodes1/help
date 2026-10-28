'use client'

import { useActionState, useEffect, useState } from 'react'
import { addOutreachLead, type OutreachActionState } from '@/app/actions/outreach'
import { normalizeOutreachPhone } from '@/lib/saudi-phone'

const initial: OutreachActionState = { ok: false, message: '' }

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const max = 1400
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that picture.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Could not read that picture.'))),
      'image/jpeg',
      0.72,
    )
  })
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that picture.'))
    reader.readAsDataURL(blob)
  })
  return dataUrl
}

export function OutreachAdd({ creatorHandle }: { creatorHandle: string | null }) {
  const [state, action, pending] = useActionState(addOutreachLead, initial)
  const [account, setAccount] = useState<string | null>(null)
  const [chat, setChat] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [pictureError, setPictureError] = useState('')

  useEffect(() => {
    if (!state.ok) return
    setAccount(null)
    setChat(null)
    setPhone('')
  }, [state])

  const preview = phone.trim() ? normalizeOutreachPhone(phone) : null

  async function onFile(kind: 'account' | 'chat', file: File | undefined) {
    setPictureError('')
    if (!file) {
      if (kind === 'account') setAccount(null)
      else setChat(null)
      return
    }
    try {
      const dataUrl = await compressImage(file)
      if (kind === 'account') setAccount(dataUrl)
      else setChat(dataUrl)
    } catch {
      setPictureError('Could not read that picture.')
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      {creatorHandle ? <input type="hidden" name="creator_handle" value={creatorHandle} /> : null}
      <input type="hidden" name="account_image" value={account ?? ''} />
      <input type="hidden" name="chat_image" value={chat ?? ''} />

      <label className="flex flex-col gap-1 text-sm font-medium">
        Account picture
        <span className="text-xs font-normal text-muted-foreground">
          The username, followers, and likes are read from this picture.
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => void onFile('account', event.target.files?.[0])}
          className="text-sm"
        />
        {account ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account} alt="Account screenshot preview" className="mt-2 h-36 w-full rounded-lg object-cover" />
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Chat with the phone number
        <span className="text-xs font-normal text-muted-foreground">
          This is where you put the chat with the phone number in it.
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => void onFile('chat', event.target.files?.[0])}
          className="text-sm"
        />
        {chat ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chat} alt="Chat screenshot preview" className="mt-2 h-36 w-full rounded-lg object-cover" />
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Phone number
        <span className="text-xs font-normal text-muted-foreground">
          Paste the number only. A 05 number is saved as a Saudi +966 number. You can change it before adding.
        </span>
        <input
          name="phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="05xxxxxxxx"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {preview?.ok ? (
          <span className="text-xs text-muted-foreground" dir="ltr">
            Saved as {preview.e164}
          </span>
        ) : preview && !preview.ok ? (
          <span className="text-xs text-destructive">{preview.error}</span>
        ) : null}
      </label>

      {pictureError ? <p className="text-sm text-destructive">{pictureError}</p> : null}
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}>{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !account || !chat || !phone.trim()}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? 'Reading pictures…' : 'Add account'}
      </button>
    </form>
  )
}
