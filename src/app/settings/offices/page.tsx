import { createClient } from '@/lib/supabase/server'
import { OfficesClient } from '@/components/settings/offices-client'

export default async function OfficesSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: member } = await supabase
    .from('members')
    .select('org_id')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .maybeSingle()

  const { data: offices } = await supabase
    .from('offices')
    .select('*')
    .eq('org_id', member!.org_id)
    .order('sort_order')
    .order('name')

  return <OfficesClient orgId={member!.org_id} initialOffices={offices ?? []} />
}
