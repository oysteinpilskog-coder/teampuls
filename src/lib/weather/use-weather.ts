'use client'

import { useEffect, useState } from 'react'

export interface WeatherSnapshot {
  tempC: number
  code: number
}

// Modulnivå-cache så samme (lat,lng) på samme TV-side aldri henter
// to ganger. Server-ruta cacher i 30 min mot Supabase, denne cacher
// resten av sesjonens levetid mot in-memory.
const memCache = new Map<string, WeatherSnapshot | null>()
const inFlight = new Map<string, Promise<WeatherSnapshot | null>>()

function key(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherSnapshot | null> {
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`, { cache: 'no-store' })
    if (res.status === 204) return null
    if (!res.ok) return null
    const json = (await res.json()) as WeatherSnapshot
    if (typeof json.tempC !== 'number' || typeof json.code !== 'number') return null
    return json
  } catch {
    return null
  }
}

/**
 * useWeather(lat, lng) — returnerer { tempC, code } eller null mens vi
 * laster / ved feil. Konsumeren forventes å rendre `null` når hooken
 * gir `null`, så TV-en aldri viser delvis lastet UI.
 *
 * Argumentene kan være `null`/`undefined` — da returnerer hooken `null`
 * uten å fetche, slik at kall-siden kan kalle hooken ubetinget (Reglene
 * for Hooks krever stabile kall-rekkefølge).
 */
export function useWeather(
  lat: number | null | undefined,
  lng: number | null | undefined
): WeatherSnapshot | null {
  const has = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
  const k = has ? key(lat as number, lng as number) : null
  const initial = k && memCache.has(k) ? memCache.get(k) ?? null : null
  const [snap, setSnap] = useState<WeatherSnapshot | null>(initial)

  useEffect(() => {
    if (!has || !k) return
    if (memCache.has(k)) {
      setSnap(memCache.get(k) ?? null)
      return
    }
    let cancelled = false
    let promise = inFlight.get(k)
    if (!promise) {
      promise = fetchWeather(lat as number, lng as number).then(result => {
        memCache.set(k, result)
        inFlight.delete(k)
        return result
      })
      inFlight.set(k, promise)
    }
    promise.then(result => {
      if (!cancelled) setSnap(result)
    })
    return () => { cancelled = true }
  }, [has, k, lat, lng])

  return snap
}
