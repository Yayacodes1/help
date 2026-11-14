/** Visible WhatsApp number + open-chat button for a creator profile. */
export function WhatsAppContact({
  phone,
  className = 'mt-2',
  buttonLabel = 'Text them on WhatsApp',
}: {
  phone: string | null | undefined
  className?: string
  buttonLabel?: string
}) {
  const trimmed = (phone ?? '').trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  const href = `https://wa.me/${digits}`

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm text-foreground">{trimmed}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
      >
        {buttonLabel}
      </a>
    </div>
  )
}
