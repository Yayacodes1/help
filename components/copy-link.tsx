export function CopyLink({
  url,
}: {
  url: string
  copyLabel?: string
  copiedLabel?: string
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="min-w-0 flex-1 truncate text-left font-medium underline underline-offset-4"
      dir="ltr"
    >
      {url}
    </a>
  )
}
