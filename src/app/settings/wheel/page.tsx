import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { WheelSettingsClient } from '@/components/settings/wheel-client'

export default async function WheelSettingsPage() {
  const { member } = await getSessionMember()
  if (!member) redirect('/')

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', member.org_id)
    .maybeSingle()

  return <WheelSettingsClient key={member.org_id} org={org!} />
}
