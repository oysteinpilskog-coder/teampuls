import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { WelcomeClient } from '@/components/settings/welcome-client'
import { toDateString } from '@/lib/dates'

/**
 * /settings/welcome — Velkomst-administrasjon.
 *
 * Listevisning av planlagte besøk (fra og med i dag) med opprett/rediger/
 * slett, samt en knapp til den eksisterende dashboard-preview-en så admin
 * kan se nøyaktig hvordan velkomst-slide F kommer til å se ut på TV.
 *
 * Vi viser bare i dag og fremover — historiske besøk er ikke relevant for
 * resepsjonen, og listen ville fort blitt uleselig om alle 9000 visits
 * skulle stables sammen. Det er enkelt å utvide til "vis historikk" senere
 * hvis behovet melder seg.
 */
export default async function WelcomeSettingsPage() {
  const { member, workspaces, activeWorkspace, combinedScope } = await getSessionMember()
  if (!member) redirect('/')

  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  const supabase = await createClient()
  const today = toDateString(new Date())

  const [visitsRes, membersRes] = await Promise.all([
    supabase
      .from('visits')
      .select('*')
      .in('org_id', orgIds)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .order('display_name'),
  ])

  return (
    <WelcomeClient
      key={combinedScope ? '__all__' : member.org_id}
      orgId={member.org_id}
      orgIds={orgIds}
      workspaces={workspaces}
      combinedView={!!combinedScope}
      orgName={activeWorkspace?.name ?? ''}
      currentMemberId={member.id}
      initialVisits={visitsRes.data ?? []}
      members={membersRes.data ?? []}
    />
  )
}
