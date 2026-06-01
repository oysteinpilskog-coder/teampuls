import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { SommerMonthMatrix } from '@/components/sommer-month-matrix'
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
 * Default-måned: aktiv måned hvis vi er i jun–aug, ellers juni for
 * kommende sommer (sep–des → neste år) eller årets sommer (jan–mai).
 */
export default async function SommerPage() {
  const { user, member, workspaces, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const today = new Date()
  const todayMonth = today.getMonth()
  const todayYear = today.getFullYear()
  const inSummer = todayMonth >= 5 && todayMonth <= 7

  const month = inSummer ? todayMonth : 5  // jun
  const year = inSummer
    ? todayYear
    : todayMonth >= 8
      ? todayYear + 1   // sep–des → neste sommer
      : todayYear       // jan–mai → denne sommeren

  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  // Pull only weekday entries (Mon–Fri) for the active month, filtered
  // server-side to vacation. Tiny payload, matches the client-side
  // filter so SSR paint is correct.
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const startStr = toDateString(monthStart)
  const endStr = toDateString(monthEnd)

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
      .gte('date', startStr)
      .lte('date', endStr)
      .eq('status', 'vacation'),
    supabase
      .from('offices')
      .select('id, org_id, country_code')
      .in('org_id', orgIds),
  ])

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
        <SommerMonthMatrix
          orgIds={orgIds}
          currentMemberId={member.id}
          currentMemberRole={(member.role ?? 'member') as MemberRole}
          initialMembers={membersRes.data ?? []}
          initialEntries={entriesRes.data ?? []}
          initialMonth={month}
          initialYear={year}
          workspaces={workspaces}
          combinedView={!!combinedScope}
          ukOfficeIds={(officesRes.data ?? [])
            .filter(o => o.country_code === 'GB')
            .map(o => o.id)}
          officeCountries={Object.fromEntries(
            (officesRes.data ?? [])
              .filter(o => o.country_code)
              .map(o => [o.id, o.country_code as string]),
          )}
        />
      </Suspense>
    </div>
  )
}
