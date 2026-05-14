import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { CustomersClient } from '@/components/settings/customers-client'

export default async function CustomersSettingsPage() {
  const { member, workspaces, combinedScope } = await getSessionMember()
  if (!member) redirect('/')

  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  const supabase = await createClient()
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .in('org_id', orgIds)
    .order('sort_order')
    .order('name')

  return (
    <CustomersClient
      key={combinedScope ? '__all__' : member.org_id}
      orgId={member.org_id}
      orgIds={orgIds}
      workspaces={workspaces}
      combinedView={!!combinedScope}
      initialCustomers={customers ?? []}
    />
  )
}
