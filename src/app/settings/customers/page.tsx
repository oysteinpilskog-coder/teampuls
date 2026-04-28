import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { CustomersClient } from '@/components/settings/customers-client'

export default async function CustomersSettingsPage() {
  const { member } = await getSessionMember()
  if (!member) redirect('/')

  const supabase = await createClient()
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', member.org_id)
    .order('sort_order')
    .order('name')

  return <CustomersClient orgId={member.org_id} initialCustomers={customers ?? []} />
}
