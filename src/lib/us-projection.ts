// Sub-projection for the USA inset card on the customer dashboard.
//
// Uses d3-geo's geoAlbersUsa, the de-facto standard projection for showing
// the contiguous US together with Alaska and Hawaii in a single frame.
// Tuned to a small 320×200 viewBox so the inset reads as a "picture-in-
// picture" relative to the main Europe canvas.
//
// Must stay in lockstep with scripts/generate-us-paths.mjs — both sides
// of the renderer (paths and pins) project through identical math.

import { geoAlbersUsa, type GeoProjection } from 'd3-geo'

export const US_MAP_WIDTH = 320
export const US_MAP_HEIGHT = 200

export function createUsProjection(): GeoProjection {
  return geoAlbersUsa()
    .scale(380)
    .translate([US_MAP_WIDTH / 2, US_MAP_HEIGHT / 2 + 6])
}

export const usProjection = createUsProjection()

/**
 * Project a lat/lng to inset pixel coordinates.
 * Returns null when the point falls outside Albers USA's clip region —
 * geoAlbersUsa already returns null for points outside CONUS/AK/HI.
 */
export function projectUs(lat: number, lng: number): { x: number; y: number } | null {
  const p = usProjection([lng, lat])
  if (!p) return null
  return { x: p[0], y: p[1] }
}

/** Loose bounding box covering the USA — used to decide if a customer
 *  should land in the US inset rather than the Europe canvas. */
export const US_BOUNDS = {
  latMin: 17,
  latMax: 72,
  lngMin: -170,
  lngMax: -65,
}
