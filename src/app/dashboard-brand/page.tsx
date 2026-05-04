import { redirect } from 'next/navigation'
import { CalwinBrandDashboard } from '@/components/calwin-brand-dashboard'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'

/**
 * /dashboard-brand — opt-in CalWin BrandBook variant of the TV dashboard.
 *
 * Mirrors /dashboard's server data fetch (orgs, members, offices, customers)
 * but renders a single fullscreen BrandBook-strict view instead of the
 * rotating multi-view experience. The standard /dashboard route is
 * untouched; this is a parallel surface so customers can pick which to
 * project on the office TV.
 */
export default async function DashboardBrandPage() {
  const { user, member, activeWorkspace, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const orgIds = combinedScope?.org_ids ?? [member.org_id]
  const headerOrgId = activeWorkspace?.id ?? member.org_id

  const supabase = await createClient()
  const [orgRes, membersRes, officesRes, customersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, timezone')
      .eq('id', headerOrgId)
      .maybeSingle(),
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
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
    <CalwinBrandDashboard
      orgIds={orgIds}
      initialOrg={orgRes.data ?? null}
      initialMembers={membersRes.data ?? []}
      initialOffices={officesRes.data ?? []}
      initialCustomers={customersRes.data ?? []}
    />
  )
}
