import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Noto_Sans_Arabic, Source_Sans_3 } from 'next/font/google'
import { getLocale } from '@/lib/locale'
import './globals.css'

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
})

const body = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
})

const arabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
})

export const metadata: Metadata = {
  title: 'Creator Submissions',
  description: 'Submit and track your Instagram and TikTok videos.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7ebe0',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${display.variable} ${body.variable} ${arabic.variable} light bg-background`}
    >
      <body className={`${locale === 'ar' ? arabic.className : body.className} antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
