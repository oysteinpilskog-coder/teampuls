import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { BillingClient } from '@/components/settings/billing-client'

/**
 * Billing & plan settings. No Stripe integration yet — this is the UI
 * surface for current plan, seat usage, the upgrade path, and invoice
 * history. Commerce wiring lands in a follow-up PR.
 */
export default async function BillingSettingsPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const supabase = await createClient()
  const [{ count: memberCount }, { data: org }] = await Promise.all([
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', member.org_id)
      .eq('is_active', true),
    // Only read columns we know exist — the `plan` column hasn't been
    // introduced yet. We default everyone to 'free' client-side until
    // the commerce migration lands.
    supabase
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', member.org_id)
      .maybeSingle(),
  ])

  return (
    <BillingClient
      orgName={org?.name ?? 'TeamPulse'}
      createdAt={org?.created_at ?? null}
      currentPlanId="free"
      seatsUsed={memberCount ?? 0}
    />
  )
}
