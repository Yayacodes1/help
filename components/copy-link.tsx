import { detectPlatformFromUrl } from '@/lib/media-url'

/** A short platform button. The full address stays on the tooltip so it does not run into the views. */
export function CopyLink({
  url,
}: {
  url: string
  copyLabel?: string
  copiedLabel?: string
}) {
  const platform = detectPlatformFromUrl(url)
  const label =
    platform === 'instagram' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : platform === 'youtube' ? 'YouTube' : 'Open'
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex shrink-0 items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
    >
      {label}
    </a>
  )
}
