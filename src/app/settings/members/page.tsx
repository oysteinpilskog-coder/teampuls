import { createClient } from '@/lib/supabase/server'
import { MembersClient } from '@/components/settings/members-client'

export default async function MembersSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: currentMember } = await supabase
    .from('members')
    .select('id, org_id')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .maybeSingle()

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('org_id', currentMember!.org_id)
    .order('display_name')

  return (
    <MembersClient
      orgId={currentMember!.org_id}
      currentMemberId={currentMember!.id}
      initialMembers={members ?? []}
    />
  )
}
