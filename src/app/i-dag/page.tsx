import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { TodayRibbons } from '@/components/today-ribbons'
import { no } from '@/lib/i18n/no'

export const metadata = {
  title: no.today.title,
}

export default async function IDagPage() {
  const { user, member } = await getSessionMember()

  if (!user) redirect('/login')
  if (!member) redirect('/')

  const supabase = await createClient()

  const [membersRes, orgRes] = await Promise.all([
    supabase
      .from('members')
      .select('id, display_name, avatar_url')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('organizations')
      .select('timezone')
      .eq('id', member.org_id)
      .maybeSingle(),
  ])

  return (
    <TodayRibbons
      orgId={member.org_id}
      timezone={orgRes.data?.timezone ?? 'Europe/Oslo'}
      allMembers={membersRes.data ?? []}
    />
  )
}
