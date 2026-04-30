import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { WelcomePreviewClient } from '@/components/dashboard/welcome-preview-client'
import { toDateString } from '@/lib/dates'

/**
 * Forhåndsvisnings-side for velkomst-slide F.
 *
 * Brukes av resepsjon/admin til å se nøyaktig hvordan «Velkommen, X» kommer
 * til å se ut på TV-en før kunden er i lokalet — uten å måtte vente på at
 * det aktive vinduet (60 min før → 15 min etter end_time) starter.
 *
 * Trekker ut alle planlagte besøk fra og med i dag (begrenset til 50 så
 * lista holder seg lesbar) og lar brukeren også teste med egendefinerte
 * data. Sider deler dashboardets dark-lock-layout, så TV-paletten gjelder.
 */
export default async function WelcomePreviewPage() {
  const { user, member, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const orgIds = combinedScope?.org_ids ?? [member.org_id]
  const headerOrgId = member.org_id
  const today = toDateString(new Date())

  const supabase = await createClient()
  const [orgRes, visitsRes, entriesRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name')
      .eq('id', headerOrgId)
      .maybeSingle(),
    supabase
      .from('visits')
      .select('*')
      .in('org_id', orgIds)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(50),
    // Aurora-bakgrunnen får sine glow-posisjoner fra dagens entries — uten
    // dem blir bakgrunnen flatere enn TV-en. Hentes server-side så preview-en
    // matcher live fra første frame.
    supabase
      .from('entries')
      .select('*')
      .in('org_id', orgIds)
      .eq('date', today),
  ])

  return (
    <WelcomePreviewClient
      orgName={orgRes.data?.name ?? ''}
      visits={visitsRes.data ?? []}
      entries={entriesRes.data ?? []}
    />
  )
}
