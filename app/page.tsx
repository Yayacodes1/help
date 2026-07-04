import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Creator Submissions</h1>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Creators submit and track their videos on one shared link. Admins manage everything from the
        dashboard.
      </p>
      <Link
        href="/submit"
        className="mt-6 h-11 rounded-lg bg-primary px-5 text-sm font-semibold leading-[2.75rem] text-primary-foreground"
      >
        Submit your videos
      </Link>
      <Link
        href="/admin/login"
        className="mt-3 h-11 px-5 text-sm font-medium leading-[2.75rem] text-muted-foreground hover:text-foreground"
      >
        Admin login
      </Link>
    </main>
  )
}
