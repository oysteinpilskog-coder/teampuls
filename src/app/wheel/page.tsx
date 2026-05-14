import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { WheelShell } from '@/components/wheel-shell'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'

export default async function WheelPage() {
  const { user, member, workspaces, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  // Org-level kill switches for the wheel views. Default each on if the
  // column is null/undefined — matches the migration default. In combined
  // view we read flags from the user's primary workspace; if any side has
  // a feature off the user can still toggle into the active one.
  const supabase = await createSupabaseServerClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('events_enabled, birthdays_enabled, anniversaries_enabled, strategies_enabled, wheel_default_view')
    .eq('id', member.org_id)
    .maybeSingle()

  const eventsEnabled = org?.events_enabled !== false
  const birthdaysEnabled = org?.birthdays_enabled !== false
  const anniversariesEnabled = org?.anniversaries_enabled !== false
  const strategiesEnabled = org?.strategies_enabled !== false
  const defaultView = (org?.wheel_default_view ?? 'events') as
    | 'events' | 'birthdays' | 'anniversaries' | 'strategy'

  // SSR-prefetch alle de tre datasettene som de fire wheel-vyene leser
  // fra. Eventene/temaene er små (< 50 rader); medlemslisten er 15-20
  // rader × ~12 kolonner. Tre paralleliserte queries → vyen hydrerer
  // rett inn i populated state uavhengig av hvilken default-tab brukeren
  // lander på.
  const orgIds = combinedScope?.org_ids ?? [member.org_id]
  const year = new Date().getFullYear()
  const memberSelect = 'id, org_id, display_name, full_name, initials, avatar_url, birth_date, start_date, birthday_visible, anniversary_visible, is_active, hidden_from_overview'
  const [eventsRes, themesRes, membersRes] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .in('org_id', orgIds)
      .lte('start_date', `${year}-12-31`)
      .gte('end_date', `${year}-01-01`)
      .order('start_date'),
    supabase
      .from('strategy_themes')
      .select('*')
      .eq('org_id', member.org_id)
      .eq('year', year)
      .order('quarter'),
    supabase
      .from('members')
      .select(memberSelect)
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name'),
  ])

  return (
    <div className="mx-auto max-w-[1220px] px-4 sm:px-6 pt-10 md:pt-14 pb-10 md:pb-12">
      <Suspense fallback={<WheelFallback />}>
        <WheelShell
          orgId={member.org_id}
          orgIds={orgIds}
          workspaces={workspaces}
          combinedView={!!combinedScope}
          eventsEnabled={eventsEnabled}
          birthdaysEnabled={birthdaysEnabled}
          anniversariesEnabled={anniversariesEnabled}
          strategiesEnabled={strategiesEnabled}
          defaultView={defaultView}
          initialEvents={eventsRes.data ?? []}
          initialThemes={themesRes.data ?? []}
          initialMembers={membersRes.data ?? []}
          initialYear={year}
        />
      </Suspense>
    </div>
  )
}

function WheelFallback() {
  // Two concentric rings rotate in opposite directions — feels intentional,
  // never mechanical. Horizon ease (cubic-bezier) instead of linear so the
  // motion breathes like the rest of the app. DESIGN_SYSTEM §7.
  return (
    <div className="w-full flex items-center justify-center py-32">
      <div className="relative w-14 h-14" aria-label="Laster" role="status">
        <div
          className="absolute inset-0 rounded-full opacity-90"
          style={{
            background: 'conic-gradient(from 0deg, transparent, var(--accent-color))',
            animation: 'wheel-spin 1.4s cubic-bezier(0.2, 0.8, 0.3, 1) infinite',
          }}
        />
        <div
          className="absolute inset-2 rounded-full opacity-60"
          style={{
            background: 'conic-gradient(from 180deg, transparent, color-mix(in oklab, var(--accent-color) 70%, transparent))',
            animation: 'wheel-spin-rev 2.0s cubic-bezier(0.2, 0.8, 0.3, 1) infinite',
          }}
        />
      </div>
    </div>
  )
}
