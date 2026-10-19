export default function LoginLoading() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5">
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        <div className="h-12 animate-pulse rounded-xl bg-muted" />
        <div className="h-12 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}
