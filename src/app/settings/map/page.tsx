import { createClient } from '@/lib/supabase/server'
import { MapColorsClient } from '@/components/settings/map-colors-client'

export default async function MapSettingsPage() {
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

  return <MapColorsClient org={org!} />
}
