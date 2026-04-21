import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard-client'
import { getSessionMember } from '@/lib/supabase/session'

export default async function DashboardPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  return <DashboardClient orgId={member.org_id} />
}
