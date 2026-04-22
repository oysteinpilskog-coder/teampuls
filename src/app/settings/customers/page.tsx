import { createClient } from '@/lib/supabase/server'
import { CustomersClient } from '@/components/settings/customers-client'

export default async function CustomersSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: member } = await supabase
    .from('members')
    .select('org_id')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .maybeSingle()

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('org_id', member!.org_id)
    .order('sort_order')
    .order('name')

  return <CustomersClient orgId={member!.org_id} initialCustomers={customers ?? []} />
}
