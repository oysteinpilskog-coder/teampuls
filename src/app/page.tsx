import { redirect } from 'next/navigation'
import { TeamGrid } from '@/components/team-grid'
import { AIInput } from '@/components/ai-input'
import { EmptyState } from '@/components/empty-state'
import { InactivityNudge } from '@/components/inactivity-nudge'
import { getSessionMember } from '@/lib/supabase/session'
import { getServerDict } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { getTodayWeekAndYear, getWeekDays, toDateString } from '@/lib/dates'

export default async function HomePage() {
  const { user, member } = await getSessionMember()

  if (!user) redirect('/login')

  // Authenticated but not yet linked to a member record
  if (!member) {
    const t = await getServerDict()
    return (
      <div className="mx-auto max-w-7xl px-6 py-20">
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
              <path
                d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.25c-3.75 0-7.5 2.25-7.5 5.25V21h15v-1.5c0-3-3.75-5.25-7.5-5.25Z"
                fill="currentColor"
              />
              <circle cx="18.5" cy="6" r="3.5" fill="var(--bg-elevated)" />
              <path d="M18.5 4.25v3.5M16.75 6h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
          title={t.auth.accountNotLinkedTitle}
          description={
            <>
              {t.auth.accountNotLinkedEmailLabel}{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong> {t.auth.accountNotLinkedDescription}{' '}
              <code className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[12px]">
                002_seed_demo.sql
              </code>{' '}
              {t.auth.accountNotLinkedSuffix}
            </>
          }
        />
      </div>
    )
  }

  // Warm the grid with the current week's members + entries server-side so
  // the page hydrates into its populated state.
  const supabase = await createClient()
  const { week, year } = getTodayWeekAndYear()
  const weekDays = getWeekDays(week, year)
  const dateStrings = weekDays.map(toDateString)

  const [membersRes, entriesRes] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('entries')
      .select('*')
      .eq('org_id', member.org_id)
      .in('date', dateStrings),
  ])

  // Today's live metrics (rendered once in the compact strip under the AI
  // input). Only truth-on-the-ground counts — assumed presence is a UI
  // affordance on the matrix, not a headline signal.
  const todayStr = toDateString(new Date())
  const todayEntries = (entriesRes.data ?? []).filter(e => e.date === todayStr)
  const todayMemberIds = new Set(todayEntries.map(e => e.member_id))
  const distinctLocations = new Set(
    todayEntries
      .map(e => (e.location_label ?? '').trim())
      .filter(Boolean),
  ).size

  const memberCount = membersRes.data?.length ?? 0

  return (
    <div className="mx-auto max-w-7xl px-6 pt-3 pb-10 space-y-5">
      {/* AI input — single, calm call to action. Sits at the top so the
          first thing users meet is the write-and-done field. */}
      <div className="mx-auto max-w-3xl">
        <AIInput orgId={member.org_id} />
      </div>

      {/* Week grid + compact meta strip. The WeekNav inside TeamGrid carries
          everything on one line: weekday+date · uke · range · NÅ · metrics
          · month-picker · prev/denne uken/next. */}
      <TeamGrid
        orgId={member.org_id}
        initialMembers={membersRes.data ?? []}
        initialEntries={entriesRes.data ?? []}
        initialWeek={week}
        initialYear={year}
        todayMetrics={{
          memberCount,
          registeredToday: todayMemberIds.size,
          distinctLocations,
        }}
      />

      <InactivityNudge orgId={member.org_id} memberId={member.id} />
    </div>
  )
}
