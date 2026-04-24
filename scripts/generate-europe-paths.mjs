// Codegen for src/lib/europe-paths.ts — pre-projected SVG path data for
// European countries using the SAME Lambert Conformal Conic projection
// as src/lib/europe-projection.ts. Generated paths and live markers
// project through identical math, so dots sit on real land.
//
// Two modes:
//   1. No args → fetches Natural Earth 10m admin-0 countries GeoJSON
//      from github.com/nvkelso/natural-earth-vector and caches it under
//      scripts/.cache/. Default.
//   2. node scripts/generate-europe-paths.mjs <path-to-file.json>
//      → reads a local TopoJSON or GeoJSON file instead of fetching.
//
// Output: src/lib/europe-paths.ts (overwritten)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { geoConicConformal, geoPath } from 'd3-geo'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(__dirname, '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'ne_10m_admin_0_countries.geojson')
const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'

// ── Projection — MUST match src/lib/europe-projection.ts ─────────────
const MAP_W = 1400
const MAP_H = 900

const projection = geoConicConformal()
  .parallels([50, 68])
  .rotate([-12, -60])
  .scale(1700)
  .translate([700, 480])

// One decimal pixel is ~0.07 mm on a typical monitor — plenty for a
// 1400×900 viewport. Trimming decimals halves the output.
const pathBuilder = geoPath(projection).pointRadius(0)

function roundPath(d) {
  // Keep 1 decimal on numbers; strip trailing ".0" altogether.
  return d.replace(/-?\d+\.\d+/g, s => {
    const n = Number(s)
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
  })
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

// ── TopoJSON → GeoJSON FeatureCollection ────────────────────────────
function topoToFeatureCollection(topo) {
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

  const features = countriesObj.geometries.map(geom => {
    let geometry = null
    if (geom.type === 'Polygon') {
      geometry = { type: 'Polygon', coordinates: geom.arcs.map(resolveArcs) }
    } else if (geom.type === 'MultiPolygon') {
      geometry = {
        type: 'MultiPolygon',
        coordinates: geom.arcs.map(p => p.map(resolveArcs)),
      }
    }
    return { type: 'Feature', properties: geom.properties ?? {}, geometry }
  })

  return { type: 'FeatureCollection', features }
}

function toFeatureCollection(raw) {
  if (raw.type === 'Topology') return topoToFeatureCollection(raw)
  if (raw.type === 'FeatureCollection') return raw
  throw new Error(`Unknown source type: ${raw.type}`)
}

// ── Europe filter ───────────────────────────────────────────────────
// Generous box so coastlines exiting the viewport still close cleanly.
const FILTER = { latMin: 28, latMax: 78, lngMin: -28, lngMax: 48 }

function featureIntersectsEurope(feature) {
  const g = feature.geometry
  if (!g) return false
  const polys =
    g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates
    : []
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (
          lat >= FILTER.latMin && lat <= FILTER.latMax &&
          lng >= FILTER.lngMin && lng <= FILTER.lngMax
        ) return true
      }
    }
  }
  return false
}

// ── Name normalisation ──────────────────────────────────────────────
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
const fc = toFeatureCollection(raw)

const results = []
let total = 0
let kept = 0

for (const feature of fc.features) {
  total++
  if (!featureIntersectsEurope(feature)) continue

  const d = pathBuilder(feature)
  if (!d) continue

  const rounded = roundPath(d)
  if (!rounded) continue

  kept++
  results.push({ name: displayName(feature.properties ?? {}), d: rounded })
}

results.sort((a, b) => a.name.localeCompare(b.name))

const header = `// AUTO-GENERATED by scripts/generate-europe-paths.mjs
// Source: ${origin}
//   https://github.com/nvkelso/natural-earth-vector
// Projection: Lambert Conformal Conic, parallels 37°N / 65°N, viewBox 0 0 ${MAP_W} ${MAP_H}
// Must stay in lockstep with src/lib/europe-projection.ts.
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
  `(${(out.length / 1024).toFixed(1)} KB, kept ${kept}/${total} features)`,
)
