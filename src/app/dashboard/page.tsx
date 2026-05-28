import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard-client'
// `redirect` is used below for unauthenticated/unbound users — keep import.
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import { resolveLocation } from '@/lib/geo'
import { fetchOfficeWeatherMap } from '@/lib/weather/fetch-weather'
import { DASHBOARD_MODE_COOKIE } from '@/lib/dashboard-mode'
import { computeHolidaysWindow } from '@/lib/holidays-server'

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
  // Server-prefetch alt som DashboardClient pleide å hente på mount. Sparer
  // fire round-trips på cold load — dashbordet hydrerer rett inn i populated
  // state i stedet for et kort tomt frame. Toggles og rotasjon kommer fra
  // én kanonisk org (headerOrgId); members, offices og customers fan-out
  // over hele scopet.
  //
  // Vær-prefetchen ble tidligere awaited ETTER hovedrunden — la til
  // 200-500 ms (cache-treff) eller 1-3 s (cold Open-Meteo) sekvensielt før
  // dashbordet kunne rendres. Nå chainer vi den av officesPromise og
  // inkluderer den i samme Promise.all, så vær-runden overlapper
  // org/members/customers — total tid = den TREGSTE av dem, ikke summen.
  const supabase = await createClient()
  const officesPromise = supabase
    .from('offices')
    .select('*')
    .in('org_id', orgIds)
    .order('sort_order')
  const weatherPromise = officesPromise.then(({ data }) => {
    const coords = (data ?? [])
      .map(o => {
        const cityHit = resolveLocation(o.city ?? o.name)
        const lat = cityHit?.lat ?? o.latitude
        const lng = cityHit?.lng ?? o.longitude
        if (typeof lat !== 'number' || typeof lng !== 'number') return null
        return { lat, lng }
      })
      .filter((c): c is { lat: number; lng: number } => c !== null)
    return fetchOfficeWeatherMap(coords)
  })

  const [orgRes, membersRes, officesRes, customersRes, initialWeather] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, timezone, dashboard_rotation_views, dashboard_view_durations, default_presence_assumption, logo_url')
      .eq('id', headerOrgId)
      .maybeSingle(),
    supabase
      .from('members')
      .select('*')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .eq('hidden_from_overview', false)
      .order('display_name'),
    officesPromise,
    supabase
      .from('customers')
      .select('*')
      .in('org_id', orgIds)
      .order('name'),
    weatherPromise,
  ])

  const offices = officesRes.data ?? []

  // Server-precompute helligdager — `date-holidays` (+ moment + alle locales,
  // ~1.6 MB) holdes utenfor klient-bundlen. Klienten leser bare den flate
  // HolidayMap-en via getHolidayFromMap().
  const holidays = computeHolidaysWindow()

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
      holidays={holidays}
    />
  )
}
