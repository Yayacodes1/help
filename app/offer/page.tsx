import { CreatorOfferForm } from '@/components/offer/offer-form'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default function OfferPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Creator partnership</p>
        <h1 className="text-2xl font-semibold tracking-tight">Get your offer</h1>
        <p className="text-sm text-muted-foreground">
          Paste your profile link (we read your last 10 videos), upload audience analytics (top
          countries % + age), and leave WhatsApp for an estimate.
        </p>
      </header>
      <CreatorOfferForm />
    </main>
  )
}
