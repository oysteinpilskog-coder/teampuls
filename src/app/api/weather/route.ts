import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Open-Meteo: gratis, ingen nøkkel, ingen rate-limit. Returnerer
// alltid `current.temperature_2m` + `current.weather_code`. Vi cacher
// per (lat,lng) rundet til 2 desimaler i Supabase i 30 min — så Oslo
// sentrum-kontorer deler én rad og to view-rotasjoner innenfor en
// halvtime medfører kun cache-treff, ingen utgående HTTP-kall.
//
// Cache er *best-effort*: hvis migrasjon 016 ikke har kjørt enda eller
// service-role-nøkkelen ikke er satt, faller vi gjennom til direkte
// Open-Meteo-henting og en in-memory fallback. Vi vil aldri skjule
// været på TV-en bare fordi en backing-tabell mangler.

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const CACHE_TTL_MS = 30 * 60 * 1000

interface OpenMeteoCurrent {
  temperature_2m: number
  weather_code: number
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent
}

interface CachedPayload {
  tempC: number
  code: number
}

function roundCoord(n: number): number {
  return Math.round(n * 100) / 100
}

function locationKey(lat: number, lng: number): string {
  return `${roundCoord(lat).toFixed(2)},${roundCoord(lng).toFixed(2)}`
}

// In-memory fallback for når Supabase-cachen ikke er tilgjengelig
// (manglende migrasjon, manglende service-role-nøkkel, etc.). Lever
// hele server-prosessens levetid; akseptabel kompromiss for å sikre at
// dashbordet alltid har vær-data uavhengig av db-tilstand.
const memCache = new Map<string, { payload: CachedPayload; ts: number }>()

async function readDbCache(
  key: string,
): Promise<{ payload: CachedPayload; ts: number } | null> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('weather_cache')
      .select('data, fetched_at')
      .eq('location_key', key)
      .maybeSingle()
    if (error || !data) return null
    return {
      payload: data.data as CachedPayload,
      ts: new Date(data.fetched_at).getTime(),
    }
  } catch {
    return null
  }
}

async function writeDbCache(key: string, payload: CachedPayload): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase
      .from('weather_cache')
      .upsert(
        { location_key: key, data: payload, fetched_at: new Date().toISOString() },
        { onConflict: 'location_key' }
      )
  } catch {
    // ignored — write-back is best-effort
  }
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<CachedPayload | null> {
  try {
    const u = new URL(OPEN_METEO)
    u.searchParams.set('latitude', String(roundCoord(lat)))
    u.searchParams.set('longitude', String(roundCoord(lng)))
    u.searchParams.set('current', 'temperature_2m,weather_code')
    u.searchParams.set('timezone', 'auto')

    const res = await fetch(u.toString(), { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as OpenMeteoResponse
    const current = json.current
    if (
      !current ||
      typeof current.temperature_2m !== 'number' ||
      typeof current.weather_code !== 'number'
    ) {
      return null
    }
    return {
      tempC: current.temperature_2m,
      code: current.weather_code,
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const latRaw = url.searchParams.get('lat')
  const lngRaw = url.searchParams.get('lng')
  if (!latRaw || !lngRaw) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 })
  }
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid lat/lng' }, { status: 400 })
  }

  const key = locationKey(lat, lng)

  // 1) Try DB cache (preferred — survives restarts, shared across nodes)
  const dbCached = await readDbCache(key)
  if (dbCached && Date.now() - dbCached.ts < CACHE_TTL_MS) {
    return NextResponse.json(dbCached.payload)
  }

  // 2) Try in-memory cache (covers manglende migrasjon)
  const mem = memCache.get(key)
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
    return NextResponse.json(mem.payload)
  }

  // 3) Fetch fresh from Open-Meteo
  const fresh = await fetchOpenMeteo(lat, lng)
  if (fresh) {
    memCache.set(key, { payload: fresh, ts: Date.now() })
    // write-back to db is fire-and-forget — don't block the response
    void writeDbCache(key, fresh)
    return NextResponse.json(fresh)
  }

  // 4) Stale-while-error: prefer eldre data over blankt
  if (dbCached) return NextResponse.json(dbCached.payload)
  if (mem) return NextResponse.json(mem.payload)

  return new NextResponse(null, { status: 204 })
}
