import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Noto_Sans_Arabic, Source_Sans_3 } from 'next/font/google'
import { getLocale } from '@/lib/locale'
import { getTheme } from '@/lib/theme'
import './globals.css'

const body = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const arabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Creator Submissions',
  description: 'Submit and track your Instagram and TikTok videos.',
  generator: 'v0.app',
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme()
  return {
    colorScheme: theme,
    themeColor: theme === 'dark' ? '#17100f' : '#f7ebe0',
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()])
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${body.variable} ${locale === 'ar' ? arabic.variable : ''} ${theme} bg-background`}
      suppressHydrationWarning
    >
      <body className={`${locale === 'ar' ? arabic.className : body.className} antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
