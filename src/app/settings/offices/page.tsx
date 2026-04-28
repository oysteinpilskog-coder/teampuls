import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { OfficesClient } from '@/components/settings/offices-client'

export default async function OfficesSettingsPage() {
  const { member } = await getSessionMember()
  if (!member) redirect('/')

  const supabase = await createClient()
  const { data: offices } = await supabase
    .from('offices')
    .select('*')
    .eq('org_id', member.org_id)
    .order('sort_order')
    .order('name')

  return <OfficesClient orgId={member.org_id} initialOffices={offices ?? []} />
}
