import { cookies } from 'next/headers'

export const THEME_COOKIE = 'app_theme'
export type Theme = 'light' | 'dark'

export async function getTheme(): Promise<Theme> {
  const store = await cookies()
  return store.get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light'
}
