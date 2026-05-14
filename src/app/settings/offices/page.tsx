import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { OfficesClient } from '@/components/settings/offices-client'

export default async function OfficesSettingsPage() {
  const { member, workspaces, combinedScope } = await getSessionMember()
  if (!member) redirect('/')

  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  const supabase = await createClient()
  const { data: offices } = await supabase
    .from('offices')
    .select('*')
    .in('org_id', orgIds)
    .order('sort_order')
    .order('name')

  return (
    <OfficesClient
      key={combinedScope ? '__all__' : member.org_id}
      orgId={member.org_id}
      orgIds={orgIds}
      workspaces={workspaces}
      combinedView={!!combinedScope}
      initialOffices={offices ?? []}
    />
  )
}
