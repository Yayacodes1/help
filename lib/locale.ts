import { cookies } from 'next/headers'
import { isLocale, type Locale } from '@/lib/i18n'

export const LOCALE_COOKIE = 'app_locale'

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : 'en'
}
