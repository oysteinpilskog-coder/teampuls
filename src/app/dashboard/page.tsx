import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard-client'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const { user, member, activeWorkspace, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  // In «Alle CalWin»-modus the dashboard spans every workspace under the
  // account. Single-workspace becomes a one-element list so the rest of
  // the dashboard is workspace-agnostic.
  const orgIds = combinedScope?.org_ids ?? [member.org_id]
  const headerOrgId = member.org_id
  const isCombined = !!combinedScope
  const combinedName = isCombined ? activeWorkspace?.name ?? null : null

  // Server-prefetch everything DashboardClient used to fetch on mount. Saves
  // four round-trips on cold load — the dashboard hydrates straight into the
  // populated state instead of a brief empty frame. Toggles and rotation
  // settings still come from a single canonical org (headerOrgId); members,
  // offices and customers fan out across the active scope.
  const supabase = await createClient()
  const [orgRes, membersRes, officesRes, customersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, timezone, dashboard_show_sick, dashboard_rotation_views, dashboard_view_durations')
      .eq('id', headerOrgId)
      .maybeSingle(),
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('offices')
      .select('*')
      .in('org_id', orgIds)
      .order('sort_order'),
    supabase
      .from('customers')
      .select('*')
      .in('org_id', orgIds)
      .order('name'),
  ])

  return (
    <DashboardClient
      orgIds={orgIds}
      headerOrgId={headerOrgId}
      isCombined={isCombined}
      combinedName={combinedName}
      initialOrg={orgRes.data ?? null}
      initialMembers={membersRes.data ?? []}
      initialOffices={officesRes.data ?? []}
      initialCustomers={customersRes.data ?? []}
    />
  )
}
