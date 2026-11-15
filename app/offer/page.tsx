import { CreatorOfferForm } from '@/components/offer/offer-form'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default function OfferPage() {
  return (
    <main
      dir="ltr"
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-5 py-8"
    >
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Creator partnership</p>
        <h1 className="text-2xl font-semibold tracking-tight">Get your offer</h1>
        <p className="text-sm text-muted-foreground">
          Profile link + audience screen recording + WhatsApp → estimate.
        </p>
      </header>
      <CreatorOfferForm />
    </main>
  )
}
