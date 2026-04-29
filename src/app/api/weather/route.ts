import { NextRequest, NextResponse } from 'next/server'
import { getWeatherForCoord } from '@/lib/weather/fetch-weather'

// Edge runtime — cold-start ~50ms vs ~300ms på Node serverless. Hele logikken
// (Supabase-cache → in-memory → Open-Meteo) bor i `lib/weather/fetch-weather.ts`
// så server-prefetch i `/dashboard/page.tsx` deler nøyaktig samme vei.
export const runtime = 'edge'

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

  const snap = await getWeatherForCoord(lat, lng)
  if (!snap) return new NextResponse(null, { status: 204 })
  return NextResponse.json(snap)
}
