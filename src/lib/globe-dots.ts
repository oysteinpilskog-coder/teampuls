// Pre-computed land-mass dot grid for the dashboard globe view.
//
// Produces a Fibonacci-sphere distribution of ~8 000 lat/lng points,
// then classifies each as land or sea using the Natural Earth 110 m
// land outline. Only the land points are exported — typically ~30 %
// of the input set, so ~2 400 dots.
//
// At runtime the GlobeCanvas projects each dot through the current
// orthographic rotation and renders it on a `<canvas>` element. SVG
// would crater at this density; canvas keeps 60 fps comfortably even
// on a TV-class GPU.
//
// The TopoJSON source (~55 KB) is dynamic-imported so it never lands
// in the dashboard shell bundle — only when view G actually mounts.

import { feature } from 'topojson-client'
import { geoContains } from 'd3-geo'
import type { Feature, MultiPolygon, Polygon } from 'geojson'

// `topojson-client` doesn't ship types and we don't want to drag in
// the full @types/topojson-* tree just to name the input shape. The
// land-110m structure is well-known: a Topology with one object
// 'land' that's a MultiPolygon GeometryCollection. Type just enough
// to satisfy `feature()`'s second argument.
interface TopoLand {
  type: 'Topology'
  objects: { land: unknown }
  arcs: unknown
  transform?: unknown
}

export interface LandDot {
  /** Longitude in degrees, -180..180. */
  lng: number
  /** Latitude in degrees, -90..90. */
  lat: number
}

/**
 * Generate `n` evenly distributed points on a unit sphere using a
 * Fibonacci spiral. Returns [lng, lat] pairs in degrees.
 *
 * The Fibonacci approach gives a near-uniform distribution without
 * the polar clustering that a naive lat/lng grid produces — critical
 * for a rotating globe so prikkene leser jevnt over alle bredder.
 */
function fibonacciSphere(n: number): Array<[number, number]> {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    // y goes from 1 (north pole) to -1 (south pole) inclusive.
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r
    const lat = (Math.asin(y) * 180) / Math.PI
    const lng = (Math.atan2(z, x) * 180) / Math.PI
    out.push([lng, lat])
  }
  return out
}

let cache: LandDot[] | null = null
let inflight: Promise<LandDot[]> | null = null

/**
 * Returns the precomputed land dot grid. First call triggers the
 * TopoJSON import + classification (~150 ms one-shot work on a
 * mid-range laptop). Subsequent calls return the cached array.
 */
export async function loadLandDots(): Promise<LandDot[]> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    // Dynamic import keeps the 55 KB JSON out of the main bundle.
    const mod = await import('world-atlas/land-110m.json')
    const topo = (mod.default ?? mod) as unknown as TopoLand
    // `feature` returns a single Feature when given a single object,
    // a FeatureCollection otherwise. land-110m has one object 'land'
    // which is a MultiPolygon — perfect for geoContains.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const land = feature(topo as any, topo.objects.land as any) as Feature<MultiPolygon | Polygon>

    // 8 000 candidates → ~2 400 land dots. Higher counts look
    // crisper but cost more per frame; this density reads as
    // continents on a TV from across the room without choking
    // the requestAnimationFrame loop.
    const candidates = fibonacciSphere(8_000)
    const dots: LandDot[] = []
    for (const [lng, lat] of candidates) {
      if (geoContains(land, [lng, lat])) {
        dots.push({ lng, lat })
      }
    }
    cache = dots
    inflight = null
    return dots
  })()
  return inflight
}
