// Client-side helper for calling /api/geocode.

export interface GeocodeHit {
  lat: number
  lng: number
  displayName: string
  city: string | null
  countryCode: string | null
  postalCode: string | null
}

export interface GeocodeInput {
  query?: string
  address?: string | null
  postalCode?: string | null
  city?: string | null
  countryCode?: string | null
}

export async function geocode(input: GeocodeInput): Promise<GeocodeHit | null> {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  return res.json() as Promise<GeocodeHit>
}
