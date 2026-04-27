import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Open-Meteo: gratis, ingen nøkkel, ingen rate-limit. Returnerer
// alltid `current.temperature_2m` + `current.weather_code`. Vi cacher
// per (lat,lng) rundet til 2 desimaler i Supabase i 30 min — så Oslo
// sentrum-kontorer deler én rad og to view-rotasjoner innenfor en
// halvtime medfører kun cache-treff, ingen utgående HTTP-kall.

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
  const supabase = createAdminClient()

  const { data: cached } = await supabase
    .from('weather_cache')
    .select('data, fetched_at')
    .eq('location_key', key)
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age < CACHE_TTL_MS) {
      return NextResponse.json(cached.data as CachedPayload)
    }
  }

  // Cache miss eller stale — hent fra Open-Meteo. Feiler stille:
  // 204 → klienten viser ingenting, ingen toast, ingen logg på TV.
  try {
    const u = new URL(OPEN_METEO)
    u.searchParams.set('latitude', String(roundCoord(lat)))
    u.searchParams.set('longitude', String(roundCoord(lng)))
    u.searchParams.set('current', 'temperature_2m,weather_code')
    u.searchParams.set('timezone', 'auto')

    const res = await fetch(u.toString(), { cache: 'no-store' })
    if (!res.ok) {
      // Stale-while-error: hvis vi har en eldre rad, bruk den heller
      // enn å vise blankt.
      if (cached) return NextResponse.json(cached.data as CachedPayload)
      return new NextResponse(null, { status: 204 })
    }
    const json = (await res.json()) as OpenMeteoResponse
    const current = json.current
    if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
      if (cached) return NextResponse.json(cached.data as CachedPayload)
      return new NextResponse(null, { status: 204 })
    }
    const payload: CachedPayload = {
      tempC: current.temperature_2m,
      code: current.weather_code,
    }

    await supabase
      .from('weather_cache')
      .upsert(
        { location_key: key, data: payload, fetched_at: new Date().toISOString() },
        { onConflict: 'location_key' }
      )

    return NextResponse.json(payload)
  } catch {
    if (cached) return NextResponse.json(cached.data as CachedPayload)
    return new NextResponse(null, { status: 204 })
  }
}
