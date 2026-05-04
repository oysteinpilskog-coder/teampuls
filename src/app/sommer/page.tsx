import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AIInput } from '@/components/ai-input'
import { TeamGrid } from '@/components/team-grid'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getISOWeek,
  getISOWeekYear,
  getTodayWeekAndYear,
  getWeekDays,
  toDateString,
} from '@/lib/dates'

const STATUS_FILTER = ['vacation'] as const

/**
 * /sommer = Oversikt-matrisen filtrert til ferie. Samme Mon–Fri grid med
 * uke-navigasjon som forsiden, men cellene viser kun status='vacation'.
 * Drag/edit-handlerne i TeamGrid skriver fortsatt hva brukeren velger;
 * statusFilter er en ren visningsfilter.
 *
 * Default-uke: hvis dagens dato er innenfor jun–aug → bruk denne uka,
 * ellers hopp til ISO-uka som inneholder 1. juni for det relevante året
 * (neste sommer hvis vi er i sept–des, ellers denne sommeren).
 */
export default async function SommerPage() {
  const { user, member, workspaces, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  const today = new Date()
  const todayMonth = today.getMonth()
  const todayYear = today.getFullYear()
  const inSummer = todayMonth >= 5 && todayMonth <= 7  // jun–aug
  const targetYear = inSummer
    ? todayYear
    : todayMonth >= 8                                  // sep–des → neste sommer
      ? todayYear + 1
      : todayYear                                      // jan–mai → denne sommeren

  let week: number
  let year: number
  if (inSummer) {
    const t = getTodayWeekAndYear()
    week = t.week
    year = t.year
  } else {
    const summerStart = new Date(targetYear, 5, 1)    // 1. juni
    week = getISOWeek(summerStart)
    year = getISOWeekYear(summerStart)
  }

  const orgIds = combinedScope?.org_ids ?? [member.org_id]
  const weekDays = getWeekDays(week, year)
  const dateStrings = weekDays.map(toDateString)

  const supabase = await createSupabaseServerClient()
  const [membersRes, entriesRes] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name'),
    // Pre-filter to vacation server-side too — saves bytes on the wire,
    // and matches the client-side statusFilter so the SSR paint is
    // already correct without a re-render flicker.
    supabase
      .from('entries')
      .select('*')
      .in('org_id', orgIds)
      .in('date', dateStrings)
      .eq('status', 'vacation'),
  ])

  // Combined-mode hides the AI input — parser can't disambiguate which
  // workspace to write into when several share members.
  const showAIInput = !combinedScope

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-3 pb-10 space-y-5">
      {showAIInput && (
        <div className="mx-auto max-w-3xl">
          <AIInput orgId={member.org_id} />
        </div>
      )}
      <Suspense fallback={null}>
        <TeamGrid
          orgId={member.org_id}
          initialMembers={membersRes.data ?? []}
          initialEntries={entriesRes.data ?? []}
          initialWeek={week}
          initialYear={year}
          workspaces={workspaces}
          combinedView={!!combinedScope}
          statusFilter={[...STATUS_FILTER]}
        />
      </Suspense>
    </div>
  )
}
