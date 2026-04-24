// Geographic helpers for the dashboard maps.
// - Lambert Conformal Conic projection tuned to Europe (see
//   ./europe-projection.ts for why)
// - Static dictionary of well-known Nordic / European cities so free-text
//   location_labels like "Fjerdingstad" or "Drammen" can be placed on the map.

import { europeProjection, MAP_WIDTH, MAP_HEIGHT } from './europe-projection'

export interface GeoBounds {
  latMin: number
  latMax: number
  lngMin: number
  lngMax: number
}

// Europe-focused frame. Wide enough to include Lisbon, tall enough for Tromsø.
// Kept for label-culling and graticule drawing.
export const EUROPE_BOUNDS: GeoBounds = {
  latMin: 35,
  latMax: 72,
  lngMin: -12,
  lngMax: 32,
}

/**
 * Project a lat/lng to pixel coordinates inside the map viewport.
 * Width/height are accepted for call-site compatibility but the projection
 * is pre-fitted to the shared MAP_WIDTH × MAP_HEIGHT — SVGs using that
 * viewBox scale the output correctly.
 */
export function project(
  lat: number,
  lng: number,
  _width: number = MAP_WIDTH,
  _height: number = MAP_HEIGHT,
): { x: number; y: number } {
  const p = europeProjection([lng, lat])
  if (!p) return { x: NaN, y: NaN }
  return { x: p[0], y: p[1] }
}

/**
 * Returns true if the point falls within the visible bounds.
 * Useful for culling labels that would overflow.
 */
export function isInBounds(
  lat: number,
  lng: number,
  bounds: GeoBounds = EUROPE_BOUNDS,
): boolean {
  return (
    lat >= bounds.latMin && lat <= bounds.latMax &&
    lng >= bounds.lngMin && lng <= bounds.lngMax
  )
}

// ─── City dictionary ──────────────────────────────────────────────────────
// Keys are lowercase, ASCII-folded. Values: { lat, lng, display }.
// Aim: cover places CalWin employees actually go. Extend freely.

interface CityCoord {
  lat: number
  lng: number
  display: string
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim()
}

const CITY_TABLE: Record<string, CityCoord> = {
  // Norge
  oslo:            { lat: 59.9139, lng: 10.7522, display: 'Oslo' },
  bergen:          { lat: 60.3913, lng:  5.3221, display: 'Bergen' },
  trondheim:       { lat: 63.4305, lng: 10.3951, display: 'Trondheim' },
  stavanger:       { lat: 58.9700, lng:  5.7331, display: 'Stavanger' },
  kristiansand:    { lat: 58.1467, lng:  7.9956, display: 'Kristiansand' },
  drammen:         { lat: 59.7440, lng: 10.2045, display: 'Drammen' },
  fredrikstad:     { lat: 59.2181, lng: 10.9298, display: 'Fredrikstad' },
  sandnes:         { lat: 58.8516, lng:  5.7369, display: 'Sandnes' },
  sarpsborg:       { lat: 59.2839, lng: 11.1097, display: 'Sarpsborg' },
  skien:           { lat: 59.2096, lng:  9.6089, display: 'Skien' },
  tonsberg:        { lat: 59.2674, lng: 10.4075, display: 'Tønsberg' },
  haugesund:       { lat: 59.4138, lng:  5.2680, display: 'Haugesund' },
  alesund:         { lat: 62.4722, lng:  6.1549, display: 'Ålesund' },
  bodo:            { lat: 67.2804, lng: 14.4049, display: 'Bodø' },
  tromso:          { lat: 69.6492, lng: 18.9553, display: 'Tromsø' },
  lillehammer:     { lat: 61.1153, lng: 10.4663, display: 'Lillehammer' },
  gjovik:          { lat: 60.7957, lng: 10.6915, display: 'Gjøvik' },
  hamar:           { lat: 60.7945, lng: 11.0680, display: 'Hamar' },
  moss:            { lat: 59.4369, lng: 10.6591, display: 'Moss' },
  asker:           { lat: 59.8335, lng: 10.4350, display: 'Asker' },
  barum:           { lat: 59.8940, lng: 10.5460, display: 'Bærum' },
  baerum:          { lat: 59.8940, lng: 10.5460, display: 'Bærum' },
  fjerdingstad:    { lat: 59.7100, lng: 10.8500, display: 'Fjerdingstad' },
  lyngdal:         { lat: 58.1381, lng:  7.0717, display: 'Lyngdal' },
  lyndgdal:        { lat: 58.1381, lng:  7.0717, display: 'Lyngdal' }, // common typo
  farsund:         { lat: 58.0944, lng:  6.8050, display: 'Farsund' },
  mandal:          { lat: 58.0297, lng:  7.4577, display: 'Mandal' },
  arendal:         { lat: 58.4619, lng:  8.7724, display: 'Arendal' },
  porsgrunn:       { lat: 59.1405, lng:  9.6561, display: 'Porsgrunn' },
  larvik:          { lat: 59.0537, lng: 10.0260, display: 'Larvik' },
  kongsberg:       { lat: 59.6661, lng:  9.6497, display: 'Kongsberg' },
  halden:          { lat: 59.1309, lng: 11.3875, display: 'Halden' },
  lillestrom:      { lat: 59.9553, lng: 11.0490, display: 'Lillestrøm' },
  jessheim:        { lat: 60.1411, lng: 11.1744, display: 'Jessheim' },

  // Sverige
  stockholm:       { lat: 59.3293, lng: 18.0686, display: 'Stockholm' },
  goteborg:        { lat: 57.7089, lng: 11.9746, display: 'Göteborg' },
  malmo:           { lat: 55.6050, lng: 13.0038, display: 'Malmö' },
  uppsala:         { lat: 59.8586, lng: 17.6389, display: 'Uppsala' },
  linkoping:       { lat: 58.4109, lng: 15.6216, display: 'Linköping' },
  vasteras:        { lat: 59.6099, lng: 16.5448, display: 'Västerås' },
  orebro:          { lat: 59.2741, lng: 15.2066, display: 'Örebro' },
  helsingborg:     { lat: 56.0465, lng: 12.6945, display: 'Helsingborg' },
  jonkoping:       { lat: 57.7826, lng: 14.1618, display: 'Jönköping' },
  umea:            { lat: 63.8258, lng: 20.2630, display: 'Umeå' },

  // Danmark
  kobenhavn:       { lat: 55.6761, lng: 12.5683, display: 'København' },
  copenhagen:      { lat: 55.6761, lng: 12.5683, display: 'København' },
  aarhus:          { lat: 56.1629, lng: 10.2039, display: 'Aarhus' },
  odense:          { lat: 55.4038, lng: 10.4024, display: 'Odense' },
  aalborg:         { lat: 57.0488, lng:  9.9217, display: 'Aalborg' },

  // Finland
  helsinki:        { lat: 60.1699, lng: 24.9384, display: 'Helsinki' },
  espoo:           { lat: 60.2055, lng: 24.6559, display: 'Espoo' },
  tampere:         { lat: 61.4978, lng: 23.7610, display: 'Tampere' },
  turku:           { lat: 60.4518, lng: 22.2666, display: 'Turku' },

  // Baltikum
  vilnius:         { lat: 54.6872, lng: 25.2797, display: 'Vilnius' },
  kaunas:          { lat: 54.8985, lng: 23.9036, display: 'Kaunas' },
  klaipeda:        { lat: 55.7033, lng: 21.1443, display: 'Klaipėda' },
  siauliai:        { lat: 55.9333, lng: 23.3167, display: 'Šiauliai' },
  riga:            { lat: 56.9496, lng: 24.1052, display: 'Riga' },
  tallinn:         { lat: 59.4370, lng: 24.7536, display: 'Tallinn' },

  // UK & Irland
  london:          { lat: 51.5074, lng: -0.1278, display: 'London' },
  manchester:      { lat: 53.4808, lng: -2.2426, display: 'Manchester' },
  birmingham:      { lat: 52.4862, lng: -1.8904, display: 'Birmingham' },
  liverpool:       { lat: 53.4084, lng: -2.9916, display: 'Liverpool' },
  newcastle:       { lat: 54.9783, lng: -1.6178, display: 'Newcastle' },
  'newcastle upon tyne': { lat: 54.9783, lng: -1.6178, display: 'Newcastle' },
  leeds:           { lat: 53.8008, lng: -1.5491, display: 'Leeds' },
  sheffield:       { lat: 53.3811, lng: -1.4701, display: 'Sheffield' },
  nottingham:      { lat: 52.9548, lng: -1.1581, display: 'Nottingham' },
  southampton:     { lat: 50.9097, lng: -1.4044, display: 'Southampton' },
  edinburgh:       { lat: 55.9533, lng: -3.1883, display: 'Edinburgh' },
  glasgow:         { lat: 55.8642, lng: -4.2518, display: 'Glasgow' },
  aberdeen:        { lat: 57.1497, lng: -2.0943, display: 'Aberdeen' },
  cambridge:       { lat: 52.2053, lng:  0.1218, display: 'Cambridge' },
  oxford:          { lat: 51.7520, lng: -1.2577, display: 'Oxford' },
  bristol:         { lat: 51.4545, lng: -2.5879, display: 'Bristol' },
  cardiff:         { lat: 51.4816, lng: -3.1791, display: 'Cardiff' },
  belfast:         { lat: 54.5973, lng: -5.9301, display: 'Belfast' },
  dublin:          { lat: 53.3498, lng: -6.2603, display: 'Dublin' },

  // Sentral-Europa
  paris:           { lat: 48.8566, lng:  2.3522, display: 'Paris' },
  lyon:            { lat: 45.7640, lng:  4.8357, display: 'Lyon' },
  marseille:       { lat: 43.2965, lng:  5.3698, display: 'Marseille' },
  berlin:          { lat: 52.5200, lng: 13.4050, display: 'Berlin' },
  hamburg:         { lat: 53.5511, lng:  9.9937, display: 'Hamburg' },
  munich:          { lat: 48.1351, lng: 11.5820, display: 'München' },
  munchen:         { lat: 48.1351, lng: 11.5820, display: 'München' },
  frankfurt:       { lat: 50.1109, lng:  8.6821, display: 'Frankfurt' },
  cologne:         { lat: 50.9375, lng:  6.9603, display: 'Köln' },
  koln:            { lat: 50.9375, lng:  6.9603, display: 'Köln' },
  dusseldorf:      { lat: 51.2277, lng:  6.7735, display: 'Düsseldorf' },
  amsterdam:       { lat: 52.3676, lng:  4.9041, display: 'Amsterdam' },
  rotterdam:       { lat: 51.9244, lng:  4.4777, display: 'Rotterdam' },
  brussels:        { lat: 50.8503, lng:  4.3517, display: 'Brussel' },
  brussel:         { lat: 50.8503, lng:  4.3517, display: 'Brussel' },
  warsaw:          { lat: 52.2297, lng: 21.0122, display: 'Warszawa' },
  warszawa:        { lat: 52.2297, lng: 21.0122, display: 'Warszawa' },
  krakow:          { lat: 50.0647, lng: 19.9450, display: 'Kraków' },
  gdansk:          { lat: 54.3520, lng: 18.6466, display: 'Gdańsk' },
  prague:          { lat: 50.0755, lng: 14.4378, display: 'Praha' },
  praha:           { lat: 50.0755, lng: 14.4378, display: 'Praha' },
  vienna:          { lat: 48.2082, lng: 16.3738, display: 'Wien' },
  wien:            { lat: 48.2082, lng: 16.3738, display: 'Wien' },
  zurich:          { lat: 47.3769, lng:  8.5417, display: 'Zürich' },
  geneva:          { lat: 46.2044, lng:  6.1432, display: 'Genève' },
  milan:           { lat: 45.4642, lng:  9.1900, display: 'Milano' },
  milano:          { lat: 45.4642, lng:  9.1900, display: 'Milano' },
  rome:            { lat: 41.9028, lng: 12.4964, display: 'Roma' },
  roma:            { lat: 41.9028, lng: 12.4964, display: 'Roma' },
  madrid:          { lat: 40.4168, lng: -3.7038, display: 'Madrid' },
  barcelona:       { lat: 41.3851, lng:  2.1734, display: 'Barcelona' },
  lisbon:          { lat: 38.7223, lng: -9.1393, display: 'Lisboa' },
  lisboa:          { lat: 38.7223, lng: -9.1393, display: 'Lisboa' },
}

/**
 * Look up lat/lng for a free-text location label.
 * Tries exact, then contains match. Returns null for unknowns.
 */
export function resolveLocation(label: string | null | undefined): CityCoord | null {
  if (!label) return null
  const folded = fold(label)
  if (!folded) return null

  if (CITY_TABLE[folded]) return CITY_TABLE[folded]

  // Contains match — picks the longest key that's a substring of the label,
  // so "Oslo sentrum" resolves to Oslo and "Stockholm hovedkontor" to Stockholm.
  let best: { key: string; coord: CityCoord } | null = null
  for (const key of Object.keys(CITY_TABLE)) {
    if (folded.includes(key) && (!best || key.length > best.key.length)) {
      best = { key, coord: CITY_TABLE[key] }
    }
  }
  return best?.coord ?? null
}

/**
 * All known cities — useful for rendering reference dots behind user data.
 */
export function allKnownCities(): CityCoord[] {
  const seen = new Set<string>()
  const out: CityCoord[] = []
  for (const c of Object.values(CITY_TABLE)) {
    const k = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}
