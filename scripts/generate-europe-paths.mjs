// Codegen for src/lib/europe-paths.ts — pre-projected SVG path data for
// European countries using the same Mercator-ish projection as
// src/lib/geo.ts (Mercator vertically, linear longitude horizontally,
// 1400×900 viewBox, lat 35–72 × lng -12–32).
//
// Two modes:
//   1. No args → fetches Natural Earth 10m admin-0 countries GeoJSON from
//      github.com/nvkelso/natural-earth-vector and caches it under
//      scripts/.cache/. This is the default — high-resolution coastlines
//      so coastal markers (Bergen, Stockholm, Lisbon, Tromsø, …) land on
//      real land and not the sea.
//   2. node scripts/generate-europe-paths.mjs <path-to-file.json>
//      → reads a local TopoJSON or GeoJSON file instead of fetching. Use
//      this when you already have a specific world-atlas file you want
//      to project (e.g. a custom simplification or a 50m file).
//
// Output: src/lib/europe-paths.ts (overwritten)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(__dirname, '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'ne_10m_admin_0_countries.geojson')
const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'

// ── Projection — must mirror src/lib/geo.ts ─────────────────────────
const BOUNDS = { latMin: 35, latMax: 72, lngMin: -12, lngMax: 32 }
const MAP_W = 1400
const MAP_H = 900

function mercatorY(latDeg) {
  const lat = (latDeg * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + lat / 2))
}
const Y_MAX = mercatorY(BOUNDS.latMax)
const Y_MIN = mercatorY(BOUNDS.latMin)

function project(lat, lng) {
  const x = ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * MAP_W
  const y = ((Y_MAX - mercatorY(lat)) / (Y_MAX - Y_MIN)) * MAP_H
  return [x, y]
}

// ── Source loading ──────────────────────────────────────────────────
async function loadSource(localPath) {
  if (localPath) {
    const raw = JSON.parse(fs.readFileSync(localPath, 'utf8'))
    return { raw, origin: `local: ${localPath}` }
  }
  if (fs.existsSync(CACHE_FILE)) {
    const stat = fs.statSync(CACHE_FILE)
    console.log(`Using cached source (${(stat.size / 1024 / 1024).toFixed(1)} MB) at ${CACHE_FILE}`)
    return {
      raw: JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')),
      origin: 'Natural Earth 10m admin-0 countries',
    }
  }
  console.log(`Fetching ${SOURCE_URL} …`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const text = await res.text()
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(CACHE_FILE, text, 'utf8')
  console.log(`Cached ${(text.length / 1024 / 1024).toFixed(1)} MB → ${CACHE_FILE}`)
  return {
    raw: JSON.parse(text),
    origin: 'Natural Earth 10m admin-0 countries',
  }
}

// ── TopoJSON → rings iterator ───────────────────────────────────────
function topoToCountries(topo) {
  const { transform, arcs: rawArcs, objects } = topo
  const [sx, sy] = transform.scale
  const [tx, ty] = transform.translate

  const arcs = rawArcs.map(arc => {
    let x = 0, y = 0
    return arc.map(([dx, dy]) => {
      x += dx
      y += dy
      return [x * sx + tx, y * sy + ty]
    })
  })

  function resolveArcs(indices) {
    const ring = []
    indices.forEach((i, ai) => {
      const rev = i < 0
      const arc = arcs[rev ? ~i : i]
      const pts = rev ? [...arc].reverse() : arc
      const start = ai === 0 ? 0 : 1
      for (let k = start; k < pts.length; k++) ring.push(pts[k])
    })
    return ring
  }

  const countriesObj = objects.countries ?? Object.values(objects)[0]
  if (!countriesObj) throw new Error('Expected a countries object in TopoJSON')

  const out = []
  for (const geom of countriesObj.geometries) {
    const props = geom.properties ?? {}
    const polys =
      geom.type === 'Polygon' ? [geom.arcs.map(resolveArcs)]
      : geom.type === 'MultiPolygon' ? geom.arcs.map(p => p.map(resolveArcs))
      : []
    out.push({ props, polys })
  }
  return out
}

// ── GeoJSON → rings iterator ────────────────────────────────────────
function geoToCountries(geo) {
  if (geo.type !== 'FeatureCollection') {
    throw new Error('Expected GeoJSON FeatureCollection')
  }
  const out = []
  for (const feature of geo.features) {
    const g = feature.geometry
    if (!g) continue
    const props = feature.properties ?? {}
    const polys =
      g.type === 'Polygon' ? [g.coordinates]
      : g.type === 'MultiPolygon' ? g.coordinates
      : []
    out.push({ props, polys })
  }
  return out
}

// Auto-detect TopoJSON vs GeoJSON from the parsed root.
function normaliseCountries(raw) {
  if (raw.type === 'Topology') return topoToCountries(raw)
  if (raw.type === 'FeatureCollection') return geoToCountries(raw)
  throw new Error(`Unknown source type: ${raw.type}`)
}

// ── Europe filter ───────────────────────────────────────────────────
// Slightly larger than the render bounds so coastlines that leave the
// viewport still render cleanly up to the edge.
const FILTER = { latMin: 30, latMax: 78, lngMin: -28, lngMax: 48 }

function anyPointInBox(ring) {
  for (const [lng, lat] of ring) {
    if (
      lat >= FILTER.latMin && lat <= FILTER.latMax &&
      lng >= FILTER.lngMin && lng <= FILTER.lngMax
    ) return true
  }
  return false
}

// ── Ring → projected, rounded, de-duplicated SVG path command ───────
// Pre-project and round to 0.5 px; drop consecutive vertices that round
// to the same pixel. At 10m resolution this shrinks output dramatically
// without visible change at 1400×900.
function ringToCommands(ring) {
  let d = ''
  let lastKey = ''
  let first = ''
  let count = 0
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i]
    const [x, y] = project(lat, lng)
    const rx = Math.round(x * 2) / 2
    const ry = Math.round(y * 2) / 2
    const key = rx + ',' + ry
    if (key === lastKey) continue
    if (count === 0) {
      d += 'M' + rx + ',' + ry
      first = key
    } else {
      d += 'L' + rx + ',' + ry
    }
    lastKey = key
    count++
  }
  if (count < 3) return ''
  d += 'Z'
  void first
  return d
}

// ── Name normalisation ──────────────────────────────────────────────
// Different sources use slightly different names; we canonicalise so
// call sites always get a stable label.
const NAME_ALIASES = {
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Republic of Serbia': 'Serbia',
  'Czech Republic': 'Czechia',
  'Republic of North Macedonia': 'Macedonia',
  'North Macedonia': 'Macedonia',
  'Turkiye': 'Turkey',
  'Türkiye': 'Turkey',
}

function displayName(props) {
  const name =
    props.NAME ??
    props.name ??
    props.NAME_LONG ??
    props.ADMIN ??
    'Unknown'
  return NAME_ALIASES[name] ?? name
}

// ── Main ────────────────────────────────────────────────────────────
const localPath = process.argv[2]
const { raw, origin } = await loadSource(localPath)
const countries = normaliseCountries(raw)

const results = []
let totalRings = 0
let keptRings = 0

for (const { props, polys } of countries) {
  if (polys.length === 0) continue
  const name = displayName(props)

  let d = ''
  for (const poly of polys) {
    for (const ring of poly) {
      totalRings++
      if (ring.length < 3) continue
      if (!anyPointInBox(ring)) continue
      keptRings++
      d += ringToCommands(ring)
    }
  }

  if (!d) continue
  results.push({ name, d })
}

results.sort((a, b) => a.name.localeCompare(b.name))

const header = `// AUTO-GENERATED by scripts/generate-europe-paths.mjs
// Source: ${origin}
//   https://github.com/nvkelso/natural-earth-vector
// Projection: Mercator (lat) + linear (lng), viewBox 0 0 ${MAP_W} ${MAP_H}
// Bounds: lat ${BOUNDS.latMin}–${BOUNDS.latMax}, lng ${BOUNDS.lngMin}–${BOUNDS.lngMax}
// DO NOT EDIT — regenerate with \`node scripts/generate-europe-paths.mjs\`.

export interface CountryPath {
  name: string
  d: string
}

export const EUROPE_COUNTRY_PATHS: CountryPath[] = [
`

const body = results
  .map(r => `  { name: ${JSON.stringify(r.name)}, d: ${JSON.stringify(r.d)} },`)
  .join('\n')

const out = header + body + '\n]\n'

const outPath = path.join(ROOT, 'src/lib/europe-paths.ts')
fs.writeFileSync(outPath, out, 'utf8')

console.log(
  `Wrote ${results.length} countries → ${outPath} ` +
  `(${(out.length / 1024).toFixed(1)} KB, kept ${keptRings}/${totalRings} rings)`,
)
