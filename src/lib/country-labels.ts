// Hand-picked label anchors for a handful of countries CalWin cares about.
// Intentionally sparse: Apple Weather / Linear-style maps only label where
// it helps orientation — more than a dozen labels looks like a textbook.
//
// Coordinates are interior points, not centroids, so the label sits inside
// the country even when the shape is concave (Norway, Sweden, Finland).

export interface CountryLabel {
  name: string
  lat: number
  lng: number
  /** Visual weight. 1 = quiet, 2 = default, 3 = slightly louder. */
  rank?: 1 | 2 | 3
}

export const COUNTRY_LABELS: CountryLabel[] = [
  { name: 'NORGE',           lat: 62.5,  lng: 10.0, rank: 3 },
  { name: 'SVERIGE',         lat: 61.5,  lng: 15.5, rank: 3 },
  { name: 'FINLAND',         lat: 64.0,  lng: 26.0, rank: 2 },
  { name: 'DANMARK',         lat: 56.15, lng:  9.5, rank: 2 },
  { name: 'ISLAND',          lat: 64.8,  lng: -18.6, rank: 1 },
  { name: 'STORBRITANNIA',   lat: 53.5,  lng: -1.5, rank: 2 },
  { name: 'IRLAND',          lat: 53.3,  lng: -8.0, rank: 1 },
  { name: 'NEDERLAND',       lat: 52.3,  lng:  5.4, rank: 1 },
  { name: 'TYSKLAND',        lat: 51.0,  lng: 10.5, rank: 2 },
  { name: 'POLEN',           lat: 52.0,  lng: 19.5, rank: 2 },
  { name: 'FRANKRIKE',       lat: 46.8,  lng:  2.5, rank: 2 },
  { name: 'SPANIA',          lat: 40.0,  lng: -3.5, rank: 2 },
  { name: 'PORTUGAL',        lat: 39.7,  lng: -8.0, rank: 1 },
  { name: 'ITALIA',          lat: 43.0,  lng: 12.5, rank: 2 },
  { name: 'LITAUEN',         lat: 55.3,  lng: 24.0, rank: 2 },
  { name: 'LATVIA',          lat: 56.9,  lng: 24.5, rank: 1 },
  { name: 'ESTLAND',         lat: 58.8,  lng: 25.5, rank: 1 },
  { name: 'HELLAS',          lat: 39.5,  lng: 22.5, rank: 1 },
]
