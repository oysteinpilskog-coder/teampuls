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
 */
export default async function EmailSettingsPage() {
  const { user, member } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member || member.role !== 'admin') redirect('/')

  const supabase = await createClient()

  const today = new Date()
  const nextMonday = addDays(startOfISOWeek(today), 7)
  const friday = addDays(nextMonday, 4)

  const [orgRes, membersRes, entriesRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('*')
      .eq('id', member.org_id)
      .maybeSingle(),
    supabase
      .from('members')
      .select('id, display_name, email, role, is_active, home_office_id')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('entries')
      .select('member_id, date, status, location_label')
      .eq('org_id', member.org_id)
      .gte('date', toDateString(nextMonday))
      .lte('date', toDateString(friday)),
  ])

  return (
    <WeeklyEmailClient
      org={orgRes.data!}
      members={membersRes.data ?? []}
      sampleEntries={entriesRes.data ?? []}
      sampleWeekNumber={getISOWeek(nextMonday)}
      sampleWeekStartIso={toDateString(nextMonday)}
      currentUserEmail={user.email ?? ''}
    />
  )
}
