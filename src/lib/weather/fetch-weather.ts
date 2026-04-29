// Shared server-side weather fetcher.
//
// Used by both:
//   • /api/weather/route.ts   — edge route som klienten polling-kaller
//   • /dashboard/page.tsx     — server-prefetch så TV-en aldri ser navn-uten-vær
//
// Tre lag for cache (samme som tidligere route-versjon, ekstrahert hit):
//   1. Per-prosess in-memory Map  — raskeste hit, men begrenset til runtime
//   2. Supabase weather_cache     — delt mellom edge + node + restarter
//   3. Open-Meteo (fersk)         — siste utvei
//
// Cachen er rundet til 2 desimaler i lat/lng, slik at to kontorer i samme
// by deler én rad og ikke trigger to oppstrøms-kall.
//
// Cache-lookup er *best-effort*: hvis Supabase-tabellen ikke finnes (cold
// project, manglende migrasjon) eller service-role-nøkkelen mangler, faller
// vi gjennom til Open-Meteo direkte og holder data i minnet. Vi vil aldri
// blokkere TV-en bare fordi cache-laget er borte.
//
// Nøkkelformatet matcher det `useWeather`-hooken bruker, slik at
// server-prefetched seed kan plugges rett inn i klient-cachen uten konvertering.

import { createAdminClient } from '@/lib/supabase/admin'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const CACHE_TTL_MS = 30 * 60 * 1000

export interface WeatherSnapshot {
  tempC: number
  code: number
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number
    weather_code: number
  }
}

/** Cache-key — to desimaler i begge dimensjoner. Må være identisk
 *  med klient-hookens key-funksjon i `use-weather.ts` slik at server-
 *  prefetched seed treffer cachen på første render. */
export function locationKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

// In-memory fallback. Per runtime: edge-route og node-server-component har
// hver sin Map, men begge skriver til samme Supabase-tabell — så DB-lag
// dekker krysset.
const memCache = new Map<string, { payload: WeatherSnapshot; ts: number }>()

async function readDbCache(
  key: string,
): Promise<{ payload: WeatherSnapshot; ts: number } | null> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('weather_cache')
      .select('data, fetched_at')
      .eq('location_key', key)
      .maybeSingle()
    if (error || !data) return null
    return {
      payload: data.data as WeatherSnapshot,
      ts: new Date(data.fetched_at).getTime(),
    }
  } catch {
    return null
  }
}

async function writeDbCache(key: string, payload: WeatherSnapshot): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase
      .from('weather_cache')
      .upsert(
        { location_key: key, data: payload, fetched_at: new Date().toISOString() },
        { onConflict: 'location_key' },
      )
  } catch {
    // best-effort
  }
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<WeatherSnapshot | null> {
  try {
    const u = new URL(OPEN_METEO)
    // Send hele presisjonen til Open-Meteo — de runder selv til ~10 km grid.
    u.searchParams.set('latitude', String(lat))
    u.searchParams.set('longitude', String(lng))
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
    return { tempC: current.temperature_2m, code: current.weather_code }
  } catch {
    return null
  }
}

/**
 * Hent vær for én koordinat med tre cache-lag. Returnerer `null` ved alle-
 * lag-mister, slik at kall-siden kan velge mellom å skjule UI eller vise
 * stale-data fra et tidligere kall.
 */
export async function getWeatherForCoord(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const key = locationKey(lat, lng)

  const dbCached = await readDbCache(key)
  if (dbCached && Date.now() - dbCached.ts < CACHE_TTL_MS) {
    return dbCached.payload
  }

  const mem = memCache.get(key)
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
    return mem.payload
  }

  const fresh = await fetchOpenMeteo(lat, lng)
  if (fresh) {
    memCache.set(key, { payload: fresh, ts: Date.now() })
    void writeDbCache(key, fresh)
    return fresh
  }

  // Stale-while-error: foretrekk eldre data over `null`.
  if (dbCached) return dbCached.payload
  if (mem) return mem.payload
  return null
}

/**
 * Hent vær for flere koordinater i parallell, returner som
 * `{ [locationKey]: snapshot }`. Hopper over duplikater (samme rundede
 * koordinat) så ingen oppstrøms-kall gjøres to ganger.
 *
 * Brukes av server-prefetch i `/dashboard/page.tsx` slik at klient-siden
 * kan seede `useWeather` og rendre vær fra første frame.
 */
export async function fetchOfficeWeatherMap(
  coords: ReadonlyArray<{ lat: number; lng: number }>,
): Promise<Record<string, WeatherSnapshot>> {
  const unique = new Map<string, { lat: number; lng: number }>()
  for (const c of coords) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue
    const k = locationKey(c.lat, c.lng)
    if (!unique.has(k)) unique.set(k, c)
  }

  const entries = await Promise.all(
    Array.from(unique.entries()).map(async ([k, c]) => {
      const snap = await getWeatherForCoord(c.lat, c.lng)
      return [k, snap] as const
    }),
  )

  const out: Record<string, WeatherSnapshot> = {}
  for (const [k, snap] of entries) {
    if (snap) out[k] = snap
  }
  return out
}
