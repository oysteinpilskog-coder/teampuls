import { createClient } from '@/lib/supabase/server'
import { OrgClient } from '@/components/settings/org-client'

export default async function OrgSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: member } = await supabase
    .from('members')
    .select('org_id')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .maybeSingle()

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', member!.org_id)
    .maybeSingle()

  return <OrgClient org={org!} />
}
