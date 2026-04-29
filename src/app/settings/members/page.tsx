import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { MembersClient } from '@/components/settings/members-client'

export default async function MembersSettingsPage() {
  const { member } = await getSessionMember()
  if (!member) redirect('/')

  const supabase = await createClient()
  const [{ data: members }, { data: offices }] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .eq('org_id', member.org_id)
      .order('display_name'),
    supabase
      .from('offices')
      .select('*')
      .eq('org_id', member.org_id)
      .order('sort_order')
      .order('created_at'),
  ])

  return (
    <MembersClient
      key={member.org_id}
      orgId={member.org_id}
      currentMemberId={member.id}
      initialMembers={members ?? []}
      initialOffices={offices ?? []}
    />
  )
}
