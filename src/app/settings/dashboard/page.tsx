import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { DashboardSettingsClient } from '@/components/settings/dashboard-client'

export default async function DashboardSettingsPage() {
  const { member } = await getSessionMember()
  if (!member) redirect('/')

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', member.org_id)
    .maybeSingle()

  return <DashboardSettingsClient org={org!} />
}
