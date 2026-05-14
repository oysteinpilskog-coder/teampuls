import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard-client'
// `redirect` is used below for unauthenticated/unbound users — keep import.
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { resolveLocation } from '@/lib/geo'
import { fetchOfficeWeatherMap } from '@/lib/weather/fetch-weather'
import { DASHBOARD_MODE_COOKIE } from '@/lib/dashboard-mode'

export default async function DashboardPage() {
  // Per-browser preference: when the cookie says "brand", apply the CalWin
  // BrandBook skin to the entire rotating dashboard. The full view set
  // (Today, Month, Offices, Customers, Wheel, Welcome, Globe) keeps its
  // structure — only the surface palette swaps. Standard mode is the
  // fallback so existing users see no change unless they opt in.
  const cookieStore = await cookies()
  const brandMode = cookieStore.get(DASHBOARD_MODE_COOKIE)?.value === 'brand'

  const { user, member, activeWorkspace, combinedScope } = await getSessionMember()
  if (!user) redirect('/login')
  if (!member) redirect('/')

  // In «Alle CalWin»-modus the dashboard spans every workspace under the
  // account. Single-workspace becomes a one-element list so the rest of
  // the dashboard is workspace-agnostic.
  const orgIds = combinedScope?.org_ids ?? [member.org_id]
  const headerOrgId = member.org_id
  const isCombined = !!combinedScope
  const combinedName = isCombined ? activeWorkspace?.name ?? null : null

  // Server-prefetch everything DashboardClient used to fetch on mount. Saves
  // four round-trips on cold load — the dashboard hydrates straight into the
  // populated state instead of a brief empty frame. Toggles and rotation
  // settings still come from a single canonical org (headerOrgId); members,
  // offices and customers fan out across the active scope.
  const supabase = await createClient()
  const [orgRes, membersRes, officesRes, customersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, timezone, dashboard_rotation_views, dashboard_view_durations, default_presence_assumption')
      .eq('id', headerOrgId)
      .maybeSingle(),
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name'),
    supabase
      .from('offices')
      .select('*')
      .in('org_id', orgIds)
      .order('sort_order'),
    supabase
      .from('customers')
      .select('*')
      .in('org_id', orgIds)
      .order('name'),
  ])

  // Server-prefetch vær for hver kontor-koordinat. Speiler `office-map-view.tsx`-
  // logikken: bydict-treff vinner over lagret lat/lng, så vi cacher med samme
  // (rundede) koordinat som klient-hooken slår opp på. Resultatet sendes som
  // `initialWeather` til DashboardClient og seedes inn i `useWeather`-cachen
  // før første render — TV-en viser navn + ikon + grader fra første frame
  // i stedet for et 1–3 s vær-vindu.
  const offices = officesRes.data ?? []
  const officeCoords = offices
    .map(o => {
      const cityHit = resolveLocation(o.city ?? o.name)
      const lat = cityHit?.lat ?? o.latitude
      const lng = cityHit?.lng ?? o.longitude
      if (typeof lat !== 'number' || typeof lng !== 'number') return null
      return { lat, lng }
    })
    .filter((c): c is { lat: number; lng: number } => c !== null)
  const initialWeather = await fetchOfficeWeatherMap(officeCoords)

  return (
    <DashboardClient
      orgIds={orgIds}
      headerOrgId={headerOrgId}
      isCombined={isCombined}
      combinedName={combinedName}
      initialOrg={orgRes.data ?? null}
      initialMembers={membersRes.data ?? []}
      initialOffices={offices}
      initialCustomers={customersRes.data ?? []}
      initialWeather={initialWeather}
      brandMode={brandMode}
    />
  )
}
