import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerDict } from '@/lib/i18n/server'

// Free, open geocoder. 1 req/s rate limit from a single IP — fine for
// interactive office editing. We cache via Next's fetch cache (24h).
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

// Nominatim asks for a contact in the UA. Falls back to localhost when unset.
const CONTACT =
  process.env.GEOCODE_CONTACT_EMAIL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'localhost'
const UA = `Offiview/1.0 (${CONTACT})`

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string>
}

// Run a single Nominatim query. Returns the first hit whose country_code
// matches `wanted`, or null if none do. We always ask for a few hits because
// the `countrycodes` filter isn't 100% respected for sparse queries.
async function tryQuery(
  params: Record<string, string>,
  wanted: string | undefined,
): Promise<NominatimHit | null> {
  const url = new URL(NOMINATIM)
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')
  url.searchParams.set('addressdetails', '1')
  if (wanted) url.searchParams.set('countrycodes', wanted)

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'no,en;q=0.8',
    },
    next: { revalidate: 86400 },
  })
  if (!res.ok) return null
  const hits = (await res.json()) as NominatimHit[]
  if (!hits.length) return null

  if (!wanted) return hits[0]
  return hits.find(h => h.address?.country_code?.toLowerCase() === wanted) ?? null
}

export async function POST(req: NextRequest) {
  const dict = await getServerDict()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    query?: string
    city?: string
    postalCode?: string
    address?: string
    countryCode?: string
  }

  const address = body.address?.trim() || ''
  const postalCode = body.postalCode?.trim() || ''
  const city = body.city?.trim() || ''
  const rawQuery = body.query?.trim() || ''
  const wanted = body.countryCode?.toLowerCase() || undefined

  const hasComponent = Boolean(address || postalCode || city)
  if (!rawQuery && !hasComponent) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  // Require a country code for anything except an explicit raw `query`.
  // Without this filter, "Newcastle" routinely resolves to Australia and
  // "Paris" to Texas — both real issues we hit in practice.
  if (!rawQuery && !wanted) {
    return NextResponse.json(
      { error: 'Country code required when searching by city/address' },
      { status: 400 },
    )
  }

  // Build a fallback chain. We try the most specific query first and fall
  // back to progressively looser ones. Each attempt is cached independently,
  // so repeated saves of the same address resolve from cache in one hop.
  const attempts: Array<Record<string, string>> = []

  if (rawQuery) {
    attempts.push({ q: rawQuery })
  }

  if (hasComponent) {
    const joined = [address, postalCode, city].filter(Boolean).join(', ')
    // 1. Full fritekst — works best for Norwegian street names with æ/ø/å
    //    and compound forms like "Karenslyst allé 20".
    if (joined) attempts.push({ q: joined })

    // 2. Structured — catches cases where fritekst tokenisation confuses
    //    the street number with the postal code.
    if (address || postalCode || city) {
      attempts.push({
        street: address,
        postalcode: postalCode,
        city: city,
      })
    }

    // 3. Drop the street — useful when the street name is misspelled or
    //    unknown to OSM but the postal code is valid.
    if (postalCode && city) {
      attempts.push({ q: `${postalCode} ${city}` })
    } else if (postalCode) {
      attempts.push({ postalcode: postalCode })
    } else if (city) {
      attempts.push({ city })
    }

    // 4. Last resort: just the postal code. Norwegian postcodes are unique
    //    per locality, so this nearly always resolves to the right town.
    if (postalCode && (address || city)) {
      attempts.push({ postalcode: postalCode })
    }
  }

  try {
    let hit: NominatimHit | null = null
    for (const params of attempts) {
      hit = await tryQuery(params, wanted)
      if (hit) break
    }

    if (!hit) {
      if (wanted) {
        return NextResponse.json(
          {
            error: dict.geocode.noMatchesInCountry.replace(
              '{country}',
              body.countryCode ?? '',
            ),
          },
          { status: 404 },
        )
      }
      return NextResponse.json({ error: dict.geocode.notFound }, { status: 404 })
    }

    const addr = hit.address ?? {}
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
