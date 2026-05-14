import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionMember } from '@/lib/supabase/session'
import { WeeklyEmailClient } from '@/components/settings/weekly-email-client'
import { toDateString, getISOWeek } from '@/lib/dates'
import { addDays, startOfISOWeek } from 'date-fns'

/**
 * /settings/email — Innstillinger for ukentlig statusmail.
 *
 * Server-prefetcher en uke med `entries` for forhåndsvisningen, så admin
 * ser et ekte (men neste-ukes) eksempel av hva mottakerne kommer til å få.
 * Vi prefetcher mandag–fredag i kommende ISO-uke; lar klienten selv plukke
 * neste sendedag basert på innstillingene.
 *
 * `offices` brukes til å utlede mottakerspråk: Stockholm-medlemmer (SE)
 * får svensk mail, Vilnius (LT) litauisk, London (GB) engelsk, Oslo (NO)
 * norsk — hvis ikke medlemmet har satt preferred_locale eksplisitt.
 */
export default async function EmailSettingsPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member || member.role !== 'admin') redirect('/')

  const supabase = await createClient()

  const today = new Date()
  const nextMonday = addDays(startOfISOWeek(today), 7)
  const friday = addDays(nextMonday, 4)

  const [orgRes, membersRes, officesRes, entriesRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .maybeSingle(),
    // Selecter `*` så vi tåler at migrasjon 023 ikke er kjørt enda
    // (preferred_locale-kolonnen kan mangle). resolveMemberLocale
    // håndterer manglende felt ved å falle tilbake til office.country.
    supabase
      .from('members')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('offices')
      .select('id, name, country_code')
      .eq('org_id', member.org_id),
    supabase
      .from('entries')
      .select('member_id, date, status, location_label')
      .eq('org_id', member.org_id)
      .gte('date', toDateString(nextMonday))
      .lte('date', toDateString(friday)),
  ])

  return (
    <WeeklyEmailClient
      key={member.org_id}
      org={orgRes.data!}
      members={membersRes.data ?? []}
      offices={officesRes.data ?? []}
      sampleEntries={entriesRes.data ?? []}
      sampleWeekNumber={getISOWeek(nextMonday)}
      sampleWeekStartIso={toDateString(nextMonday)}
      currentUserEmail={user.email ?? ''}
    />
  )
}
