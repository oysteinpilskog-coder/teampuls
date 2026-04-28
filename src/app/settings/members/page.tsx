import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { MembersClient } from '@/components/settings/members-client'

export default async function MembersSettingsPage() {
  const { member } = await getSessionMember()
  if (!member) redirect('/')

  const supabase = await createClient()
  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('org_id', member.org_id)
    .order('display_name')

  return (
    <MembersClient
      orgId={member.org_id}
      currentMemberId={member.id}
      initialMembers={members ?? []}
    />
  )
}
