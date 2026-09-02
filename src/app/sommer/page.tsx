import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { SommerView } from '@/components/sommer-view'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import { getServerDict } from '@/lib/i18n/server'
import { toDateString } from '@/lib/dates'
import type { MemberRole } from '@/lib/supabase/types'

/**
 * /sommer = ferie-matrise, måned-for-måned. Samme bar/linje-stil som
 * Oversikt, men hele måneden vises på en gang istedenfor en uke.
 * Vacation-only filter — andre statuser er gjemt for å holde fokuset
 * på sommerplanleggingen.
 *
 * Default: alltid inneværende år, med aktiv måned i jun–aug og juni
 * ellers. Siden hoppet tidligere til NESTE sommer fra september av, noe
 * som leses som en feil når du lander på den — ukevisningen sier ikke
 * hvilket år den viser. SommerViews årsvelger gjør året eksplisitt og
 * neste sommer ett klikk unna, så defaulten slipper å gjette.
 */
export default async function SommerPage() {
  const { user, member, workspaces, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const today = new Date()
  const todayMonth = today.getMonth()
  const inSummer = todayMonth >= 5 && todayMonth <= 7

  const month = inSummer ? todayMonth : 5  // jun
  const year = today.getFullYear()

  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  // Pull the whole target year of vacation entries (vacation-only, so the
  // payload stays tiny). The day view slices this down to its active month
  // for the SSR paint; the week view auto-fits its columns to the span of
  // weeks that actually contain vacation across the year.
  const yearStart = toDateString(new Date(year, 0, 1))
  const yearEnd = toDateString(new Date(year, 11, 31))
  const monthStartStr = toDateString(new Date(year, month, 1))
  const monthEndStr = toDateString(new Date(year, month + 1, 0))

  const dict = await getServerDict()

  const supabase = await createSupabaseServerClient()
  const [membersRes, entriesRes, officesRes] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name'),
    supabase
      .from('entries')
      .select('*')
      .in('org_id', orgIds)
      .gte('date', yearStart)
      .lte('date', yearEnd)
      .eq('status', 'vacation'),
    supabase
      .from('offices')
      .select('id, org_id, country_code')
      .in('org_id', orgIds),
  ])

  const yearEntries = entriesRes.data ?? []
  const monthEntries = yearEntries.filter(
    (e) => e.date >= monthStartStr && e.date <= monthEndStr,
  )

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-3 pb-10 space-y-5">
      <div className="mx-auto max-w-3xl">
        <AIInput
          orgId={member.org_id}
          orgIds={orgIds}
          placeholders={dict.aiInput.vacationPlaceholder}
        />
      </div>
      <Suspense fallback={null}>
        <SommerView
          orgIds={orgIds}
          currentMemberId={member.id}
          currentMemberRole={(member.role ?? 'member') as MemberRole}
          initialMembers={membersRes.data ?? []}
          monthEntries={monthEntries}
          yearEntries={yearEntries}
          initialMonth={month}
          initialYear={year}
          workspaces={workspaces}
          combinedView={!!combinedScope}
          ukOfficeIds={(officesRes.data ?? [])
            .filter(o => o.country_code === 'GB')
            .map(o => o.id)}
        />
      </Suspense>
    </div>
  )
}
