'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLocale, type Locale } from '@/lib/i18n'
import { LOCALE_COOKIE } from '@/lib/locale'

export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
