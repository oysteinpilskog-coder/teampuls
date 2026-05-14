import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { MembersClient } from '@/components/settings/members-client'

export default async function MembersSettingsPage() {
  const { member, workspaces, combinedScope } = await getSessionMember()
  if (!member) redirect('/')

  // I «Alle CalWin»-modus utvider vi fan-out til alle arbeidsområdene
  // i kontoen, så UK-medlemmer dukker opp ved siden av Nordic. RLS
  // sikrer fortsatt at brukeren bare ser orger de er medlem av.
  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  const supabase = await createClient()
  const [{ data: members }, { data: offices }] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .order('display_name'),
    supabase
      .from('offices')
      .select('*')
      .in('org_id', orgIds)
      .order('sort_order')
      .order('created_at'),
  ])

  return (
    <MembersClient
      key={combinedScope ? '__all__' : member.org_id}
      orgId={member.org_id}
      orgIds={orgIds}
      workspaces={workspaces}
      combinedView={!!combinedScope}
      currentMemberId={member.id}
      initialMembers={members ?? []}
      initialOffices={offices ?? []}
    />
  )
}
