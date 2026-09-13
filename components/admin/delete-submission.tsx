'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteSubmission } from '@/app/actions/admin'

export function DeleteSubmission({ id }: { id: number }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm('Delete this video?')) startTransition(() => deleteSubmission(id))
      }}
      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-60"
      title="Delete video"
    >
      <Trash2 className="size-4" />
    </button>
  )
}
