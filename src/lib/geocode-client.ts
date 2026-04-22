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
  let res: Response
  try {
    res = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  // Only attempt to parse when the server actually returned JSON. Auth
  // redirects or middleware can serve HTML, which would throw.
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return await res.json() as GeocodeHit
  } catch {
    return null
  }
}
