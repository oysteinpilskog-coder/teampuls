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
// Standard parallels 37°N / 65°N bracket the audience (North Africa →
// Lapland) so local shape distortion is minimised over the entire map.
//
// Scale + translate are tuned manually because d3-geo's fitExtent has a
// known bug on triaxially-rotated conic projections where it returns a
// near-zero scale. The values below place the Europe bbox (Tromsø →
// Athens, Reykjavík → Istanbul) comfortably inside the 1400×900 viewBox
// with ~130 px of breathing room top and bottom, so that a dashboard
// container with a much wider aspect still shows the whole continent
// after "xMidYMid slice" cropping.

import { geoConicConformal, type GeoProjection } from 'd3-geo'

export const MAP_WIDTH = 1400
export const MAP_HEIGHT = 900

export function createEuropeProjection(): GeoProjection {
  return geoConicConformal()
    .parallels([37, 65])
    .rotate([-10, -52])
    .scale(1020)
    .translate([700, 470])
}

export const europeProjection = createEuropeProjection()
