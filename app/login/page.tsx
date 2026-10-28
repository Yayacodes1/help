import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { getLeaderSession } from '@/lib/leader-auth'
import { getOutreachSession } from '@/lib/outreach-auth'
import { UnifiedLogin } from '@/components/unified-login'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin')
  if (await getLeaderSession()) redirect('/leader')
  if (await getOutreachSession()) redirect('/outreach')
  const locale = await getLocale()
  return <UnifiedLogin locale={locale} />
}
