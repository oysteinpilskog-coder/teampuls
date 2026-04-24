// Shared Europe projection used by both the runtime map renderer
// (markers, graticule, labels) and the build-time country-path generator.
//
// Why Lambert Conformal Conic: it's the projection used by virtually
// every European atlas (and the EU's own ETRS89-LCC). Countries look
// right — Norway curves to the north-east, the UK sits where you
// expect, the Mediterranean basin spreads out cleanly — without the
// "stretched east-west, squashed north-south" feel of Mercator at
// these latitudes.
//
// Framing is tuned for the Nordic/Baltic + UK triangle — CalWin's
// operational footprint. Standard parallels 50°N / 68°N bracket the
// audience (London → Tromsø) so local shape distortion is minimised
// over the entire visible area. Rotate origin sits over Scandinavia so
// that zooming in doesn't crop Norway's north coast.

import { geoConicConformal, type GeoProjection } from 'd3-geo'

export const MAP_WIDTH = 1400
export const MAP_HEIGHT = 900

export function createEuropeProjection(): GeoProjection {
  return geoConicConformal()
    .parallels([50, 68])
    .rotate([-12, -60])
    .scale(1700)
    .translate([700, 480])
}

export const europeProjection = createEuropeProjection()
