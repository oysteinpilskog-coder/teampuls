import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Free, open geocoder. 1 req/s rate limit from a single IP — fine for
// interactive office editing. We cache via Next's fetch cache (24h).
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

// Nominatim asks for a contact in the UA. Falls back to localhost when unset.
const CONTACT =
  process.env.GEOCODE_CONTACT_EMAIL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'localhost'
const UA = `TeamPulse/1.0 (${CONTACT})`

export async function POST(req: NextRequest) {
  // Auth — only logged-in members can geocode.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    query?: string
    city?: string
    postalCode?: string
    address?: string
    countryCode?: string
  }

  const parts = [body.address, body.postalCode, body.city].filter(p => p && p.trim())
  const query = (body.query ?? parts.join(', ')).trim()
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  // Require a country code for anything except an explicit raw `query`.
  // Without this filter, "Newcastle" routinely resolves to Australia and
  // "Paris" to Texas — both real issues we hit in practice.
  if (!body.query && !body.countryCode) {
    return NextResponse.json(
      { error: 'Country code required when searching by city/address' },
      { status: 400 },
    )
  }

  const url = new URL(NOMINATIM)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  // Ask for a few hits so we can prefer the one that actually matches
  // the requested country — Nominatim's `countrycodes` filter isn't
  // always honoured for postal-code only queries.
  url.searchParams.set('limit', '5')
  url.searchParams.set('addressdetails', '1')
  if (body.countryCode) {
    url.searchParams.set('countrycodes', body.countryCode.toLowerCase())
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'no,en;q=0.8',
      },
      // Cache the upstream response for 24h — same address resolves instantly.
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Nominatim returned ${res.status}` },
        { status: 502 },
      )
    }

    const hits = await res.json() as Array<{
      lat: string
      lon: string
      display_name: string
      address?: Record<string, string>
    }>

    if (!hits.length) {
      return NextResponse.json({ error: 'Fant ikke adressen' }, { status: 404 })
    }

    // Prefer a hit whose country matches the requested one — defensive
    // against upstream ignoring the `countrycodes` filter (rare but real).
    const wanted = body.countryCode?.toLowerCase()
    const hit =
      (wanted && hits.find(h => h.address?.country_code?.toLowerCase() === wanted)) ||
      hits[0]
    const addr = hit.address ?? {}

    if (wanted && addr.country_code?.toLowerCase() !== wanted) {
      return NextResponse.json(
        {
          error: `Fant ingen treff i ${body.countryCode} — prøv en mer spesifikk adresse`,
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      displayName: hit.display_name,
      city:
        addr.city ??
        addr.town ??
        addr.village ??
        addr.municipality ??
        addr.county ??
        null,
      countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
      postalCode: addr.postcode ?? null,
    })
  } catch {
    return NextResponse.json(
      { error: 'Nominatim unreachable' },
      { status: 502 },
    )
  }
}
