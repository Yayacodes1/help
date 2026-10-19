export default function SubmitLoading() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 py-10">
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  )
}
