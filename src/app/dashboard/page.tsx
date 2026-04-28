import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard-client'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  // Server-prefetch everything DashboardClient used to fetch on mount. Saves
  // four round-trips on cold load — the dashboard hydrates straight into the
  // populated state instead of a brief empty frame.
  const supabase = await createClient()
  const [orgRes, membersRes, officesRes, customersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, timezone, dashboard_show_sick, dashboard_rotation_views, dashboard_view_durations')
      .eq('id', member.org_id)
      .maybeSingle(),
    supabase
      .from('members')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('offices')
      .select('*')
      .eq('org_id', member.org_id)
      .order('sort_order'),
    supabase
      .from('customers')
      .select('*')
      .eq('org_id', member.org_id)
      .order('name'),
  ])

  return (
    <DashboardClient
      orgId={member.org_id}
      initialOrg={orgRes.data ?? null}
      initialMembers={membersRes.data ?? []}
      initialOffices={officesRes.data ?? []}
      initialCustomers={customersRes.data ?? []}
    />
  )
}
