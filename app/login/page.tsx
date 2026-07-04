import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin-auth'
import { UnifiedLogin } from '@/components/unified-login'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin')
  return <UnifiedLogin />
}
