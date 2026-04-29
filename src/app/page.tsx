import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { TeamGrid } from '@/components/team-grid'
import { AIInput } from '@/components/ai-input'
import { EmptyState } from '@/components/empty-state'
import { InactivityNudge } from '@/components/inactivity-nudge'
import { TodaysGuestsRail } from '@/components/todays-guests-rail'
import { getSessionMember } from '@/lib/supabase/session'
import { getServerDict } from '@/lib/i18n/server'
import { createClient } from '@/lib/supabase/server'
import { getTodayWeekAndYear, getWeekDays, toDateString } from '@/lib/dates'
import type { CombinedScope } from '@/lib/supabase/session'
import type { WorkspaceSummary, Visit } from '@/lib/supabase/types'

export default async function HomePage() {
  const { user, member, workspaces, combinedScope } = await getSessionMember()

  if (!user) redirect('/login')

  // Authenticated but not yet linked to a member record
  if (!member) {
    const t = await getServerDict()
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
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

  // In combined view we hide the AI input — Claude can't disambiguate
  // which workspace to write into when several share members ("Johan"
  // could resolve to either side). The user picks a single workspace
  // first if they want to log a status. The InactivityNudge is also
  // workspace-scoped so we hide it.
  const showSingleWorkspaceAffordances = !combinedScope
  const { week, year } = getTodayWeekAndYear()
  const orgIds = combinedScope?.org_ids ?? [member.org_id]

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-3 pb-10 space-y-5">
      {showSingleWorkspaceAffordances && (
        <div className="mx-auto max-w-3xl">
          <AIInput orgId={member.org_id} />
        </div>
      )}

      {/* «Dagens gjester» — annonserer Velkomst-modus ved sin egen
          tilstedeværelse. Empty state forklarer feature, fylt rail blir
          teamets bulletin board for ventede besøk. SSR-prefetcher dagens
          rader så raila ikke flasher tom før realtime tar over. */}
      <Suspense fallback={null}>
        <TodaysGuestsLoader orgIds={orgIds} />
      </Suspense>

      {/* Stream the matrix in via Suspense — the shell (header, AI input)
          paints immediately while the members + entries queries resolve.
          On cold loads this turns a single blocking-await into FCP-now,
          matrix-soon-after. */}
      <Suspense fallback={<TeamGridSkeleton />}>
        <TeamGridLoader
          orgIds={orgIds}
          memberOrgId={member.org_id}
          week={week}
          year={year}
          workspaces={workspaces}
          combinedScope={combinedScope}
        />
      </Suspense>

      {showSingleWorkspaceAffordances && (
        <InactivityNudge orgId={member.org_id} memberId={member.id} />
      )}
    </div>
  )
}

async function TodaysGuestsLoader({ orgIds }: { orgIds: string[] }) {
  const supabase = await createClient()
  const todayStr = toDateString(new Date())
  // RLS on visits enforces org_id ∈ current_user_org_ids() — so this read
  // is implicitly scoped to the workspaces the user is a member of, even
  // in combined-mode where orgIds spans multiple sides of «Alle CalWin».
  const { data } = await supabase
    .from('visits')
    .select('*')
    .in('org_id', orgIds)
    .eq('date', todayStr)
    .order('start_time', { ascending: true })
  const visits: Visit[] = data ?? []
  return <TodaysGuestsRail orgIds={orgIds} initial={visits} />
}

interface TeamGridLoaderProps {
  orgIds: string[]
  memberOrgId: string
  week: number
  year: number
  workspaces: WorkspaceSummary[]
  combinedScope: CombinedScope | null
}

async function TeamGridLoader({
  orgIds,
  memberOrgId,
  week,
  year,
  workspaces,
  combinedScope,
}: TeamGridLoaderProps) {
  const supabase = await createClient()
  const weekDays = getWeekDays(week, year)
  const dateStrings = weekDays.map(toDateString)

  const [membersRes, entriesRes] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('entries')
      .select('*')
      .in('org_id', orgIds)
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
    <TeamGrid
      orgId={memberOrgId}
      initialMembers={membersRes.data ?? []}
      initialEntries={entriesRes.data ?? []}
      initialWeek={week}
      initialYear={year}
      todayMetrics={{
        memberCount,
        registeredToday: todayMemberIds.size,
        distinctLocations,
      }}
      workspaces={workspaces}
      combinedView={!!combinedScope}
    />
  )
}

/**
 * Matches the loading.tsx skeleton style so the Suspense fallback reads as
 * the same surface — only the WeekNav + AI input header (already painted
 * by the shell) is missing here. Six placeholder rows match the typical
 * 5-15 member roster CalWin uses today.
 */
function TeamGridSkeleton() {
  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
        <div className="h-8 w-24 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
      </div>

      <div
        className="rounded-3xl p-4"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        }}
      >
        <div className="grid gap-2 px-4 py-4" style={{ gridTemplateColumns: '88px repeat(5, 1fr)' }}>
          <div />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-[var(--bg-subtle)] animate-pulse" />
          ))}
        </div>
        <div className="space-y-2 p-2">
          {Array.from({ length: 6 }).map((_, r) => (
            <div
              key={r}
              className="grid gap-2 items-center"
              style={{ gridTemplateColumns: '88px repeat(5, 1fr)' }}
            >
              <div className="flex flex-col items-center gap-1.5 py-1">
                <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-[var(--bg-subtle)] animate-pulse" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[84px] rounded-2xl bg-[var(--bg-subtle)] animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
