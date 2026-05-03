'use client'

import { useEffect, useRef } from 'react'
import type { GlobeInstance } from 'globe.gl'

/**
 * One office input to the globe. Carries everything we need to render
 * a marker, build a tooltip and decide whether the office is currently
 * "open" by local working hours.
 */
export interface OfficePoint {
  id: string
  /** Display name (city if present, else office name). Drives tooltip + arc keys. */
  name: string
  city: string
  country: string
  lat: number
  lng: number
  /** IANA timezone if known (e.g. "Europe/Vilnius"). null falls back to longitude/15. */
  timezone: string | null
  /** True for the org's HQ — gets a brighter colour and a slightly bigger marker. */
  isHq: boolean
  /** Active members assigned to this office. Surfaced in the tooltip. */
  team: number
}

/** Great-circle arc connecting two offices. */
export interface OfficeArc {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
}

/**
 * Per-office data the parent feeds to the HTML label overlay each tick.
 * Kept separate from `OfficePoint` because the time/status fields churn
 * every minute while the office data itself is stable — feeding them
 * through a callback lets the canvas component refresh card text in
 * place without rebuilding the WebGL points layer.
 */
export interface OfficeLabelMeta {
  city: string
  /** ISO 3166-1 alpha-2 — drives the country chip. Empty string hides it. */
  countryCode: string
  /** Pre-formatted "HH:MM" string in the office's local timezone. */
  localTime: string
  status: 'hq' | 'open' | 'closed'
  /** Hex CSS colour used for the label dot + stem accent. */
  statusColor: string
}

interface GlobeCanvasProps {
  offices: OfficePoint[]
  arcs: OfficeArc[]
  /** Color callback per office. Lets the parent express "open / closed / HQ"
   *  in domain terms rather than baking work-hour rules into this layer. */
  pointColor: (o: OfficePoint) => string
  /** HTML string (yes, string — globe.gl tooltip API) to render on hover. */
  pointLabel: (o: OfficePoint) => string
  /** Per-office derived data for the HTML label overlay. */
  labelMeta: (o: OfficePoint) => OfficeLabelMeta
  /** Initial camera pose. `altitude` 1 ≈ Earth-radius distance.
   *  Default is Europe-centred at ~Norway/UK eye-line, slightly tilted south. */
  initialView?: { lat: number; lng: number; altitude: number }
  /** Auto-rotate degrees per second. 0 disables; default 0.3 (very slow). */
  autoRotateSpeed?: number
}

const TEXTURE_NIGHT = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'
const TEXTURE_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const TEXTURE_SKY = 'https://unpkg.com/three-globe/example/img/night-sky.png'

/** Pin tip altitude — drives where labels anchor in screen space. */
const PIN_ALT = 0.10

/**
 * Match three-globe's polar→cartesian convention so the dot product
 * against `camera.position` decides front/back-face correctly. The
 * sign on x mirrors three-globe's own helper — getting it wrong puts
 * every other longitude on the "wrong" side of the planet.
 */
function unitCart(lat: number, lng: number) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  return {
    x: -Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  }
}

/**
 * Wrapper around vanilla globe.gl — three.js-backed Earth with a
 * realistic night-lights texture. Two layers stacked under one wrapper:
 *
 * - The WebGL canvas (mounted by globe.gl) draws the planet, pins, rings
 *   and arcs.
 * - An HTML overlay (DOM siblings of the canvas) draws glass-pill labels
 *   per office. We position them every animation frame via
 *   `getScreenCoords` and hide back-side ones via a dot-product against
 *   the camera direction — so labels read crisply with system fonts (no
 *   canvas-text mojibake on Norwegian glyphs) and we get real CSS for
 *   blur, shadows and the country chip.
 *
 * The Globe instance lives for the lifetime of the wrapper element.
 * Subsequent prop changes are pushed into the existing instance via
 * its setter methods rather than rebuilding the renderer — that keeps
 * the auto-rotation continuous when offices/arcs are upserted in real
 * time without flashing the camera back to its starting pose.
 */
export function GlobeCanvas({
  offices,
  arcs,
  pointColor,
  pointLabel,
  labelMeta,
  initialView = { lat: 55, lng: 15, altitude: 2.2 },
  autoRotateSpeed = 0.3,
}: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  // DOM cache for the HTML labels — built once per office, mutated in
  // place when meta changes so we don't churn the React tree.
  const labelElsRef = useRef(new Map<string, HTMLElement>())
  const officesRef = useRef<OfficePoint[]>(offices)

  // Ref-mirrors of accessor props so setters bound on first render see
  // the latest closure-captured state without us having to rebind on
  // every render (which would defeat globe.gl's diffing).
  const pointColorRef = useRef(pointColor)
  const pointLabelRef = useRef(pointLabel)
  const labelMetaRef = useRef(labelMeta)
  pointColorRef.current = pointColor
  pointLabelRef.current = pointLabel
  labelMetaRef.current = labelMeta
  officesRef.current = offices

  // One-shot mount: lazy-import globe.gl, build the instance, hand it
  // a fixed set of accessors that read from the refs. Cleanup tears
  // the WebGL context down so a workspace switch doesn't leak GPUs.
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    ;(async () => {
      // globe.gl 2.32+ ships as a class — instantiate via `new`. The
      // older `Globe()(element)` factory pattern that you'll see in
      // the docs was deprecated in 2024.
      const { default: Globe } = await import('globe.gl')
      if (cancelled || !containerRef.current) return

      const g = new Globe(containerRef.current)
        .globeImageUrl(TEXTURE_NIGHT)
        .bumpImageUrl(TEXTURE_BUMP)
        .backgroundImageUrl(TEXTURE_SKY)
        .atmosphereColor('#4a90e2')
        .atmosphereAltitude(0.22)
        // ── Office pins. Slim "stalk" geometry — narrower than globe.gl's
        // defaults so they don't bury labels under giant capsules at our
        // Europe-zoom altitude. The radar ring (below) does the heavy
        // lifting on locating the pin from across the room; the pin itself
        // can stay elegant.
        .pointLat('lat')
        .pointLng('lng')
        .pointAltitude(PIN_ALT)
        .pointRadius((d: object) => ((d as OfficePoint).isHq ? 0.7 : 0.45))
        .pointColor((d: object) => pointColorRef.current(d as OfficePoint))
        .pointLabel((d: object) => pointLabelRef.current(d as OfficePoint))
        .pointsTransitionDuration(1500)
        // ── Pulsing radar rings — one per office, propagating outward
        // every 1.8 s. Drives the «levende sentral»-følelsen: hver pin
        // er ikke bare et punkt, men en aktiv beacon. globe.gl tegner
        // ringene som flate skiver klistret på sfæren, så de leser
        // som fra-bakken-pulser uavhengig av kamerapose.
        .ringLat('lat')
        .ringLng('lng')
        .ringMaxRadius(4.5)
        .ringPropagationSpeed(1.8)
        .ringRepeatPeriod(1800)
        .ringAltitude(0.005)
        .ringColor((d: object) => {
          const o = d as OfficePoint
          const c = pointColorRef.current(o)
          return (t: number) => {
            const alpha = (1 - t) * 0.85
            const hex = c.replace('#', '')
            const r = parseInt(hex.slice(0, 2), 16)
            const grn = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            return `rgba(${r},${grn},${b},${alpha.toFixed(3)})`
          }
        })
        // Animated mesh arcs — connecting the offices as a network.
        // Gold-tinted because every arc starts at HQ in the current
        // data shape; the colour matches the HQ pin/label so the eye
        // reads the network as "spreading out from the home base."
        .arcColor(() => [
          'rgba(251,191,36,0.0)',
          'rgba(251,191,36,0.7)',
          'rgba(251,191,36,0.0)',
        ])
        .arcAltitudeAutoScale(0.4)
        .arcStroke(0.32)
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime(3000)

      // Push initial data immediately so the first paint isn't a
      // bare globe. The data-sync useEffects below only fire when
      // their array refs change; on first mount globeRef.current is
      // still null while React is mid-effect, so they no-op away
      // their initial run. Push here to seed the layers.
      g.pointsData(offices)
      g.ringsData(offices)
      g.arcsData(arcs)

      // Initial camera + auto-rotate speed. controls() returns the
      // OrbitControls instance — three.js convention.
      g.pointOfView(initialView, 0)
      const controls = g.controls()
      controls.autoRotate = autoRotateSpeed > 0
      controls.autoRotateSpeed = autoRotateSpeed
      // Disable user interaction — TV surface is read-only and we
      // don't want a cleaner bumping the camera off-axis.
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableRotate = false

      globeRef.current = g

      // Build initial HTML label DOM nodes
      buildLabels(officesRef.current)

      // Resize handling — globe.gl auto-fills the container, but on
      // window resize we explicitly nudge it so the canvas keeps up
      // (the library's own resize observer can lag on multi-monitor
      // TV setups).
      const onResize = () => {
        if (!containerRef.current) return
        g.width(containerRef.current.clientWidth)
        g.height(containerRef.current.clientHeight)
      }
      onResize()
      window.addEventListener('resize', onResize)

      // ── Animation loop — sync HTML label positions every frame.
      // The auto-rotate ticks through three.js, so labels need to
      // ride along; rAF keeps us in sync with the renderer's own
      // cadence. Cost: ~10 trig + DOM transform writes per frame
      // for a dozen offices. Negligible vs the WebGL draw call.
      let raf = 0
      const tick = () => {
        positionLabels()
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        // globe.gl exposes a destructor on the kapsule that releases
        // WebGL resources. The double-cast is because the type from
        // the library doesn't expose it but it exists at runtime —
        // verified against globe.gl 2.32+.
        const destructor = (g as unknown as { _destructor?: () => void })
          ._destructor
        if (destructor) destructor()
        else if (containerRef.current) containerRef.current.innerHTML = ''
        if (overlayRef.current) overlayRef.current.innerHTML = ''
        labelElsRef.current.clear()
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
      globeRef.current = null
    }
    // initialView/autoRotateSpeed are captured into the instance once;
    // if they change later we push the new values via the dedicated
    // effect below rather than rebuilding the renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push offices/arcs through the existing instance. globe.gl diffs
  // by reference identity so we pass the arrays through directly —
  // no mapping-into-new-objects each render or the points-transition
  // animation would replay every tick. Rings share the offices array
  // since they're keyed off the same lat/lng. Labels are mirrored
  // into the HTML overlay via buildLabels (idempotent — only adds
  // missing entries / removes dropped ones).
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.pointsData(offices)
    g.ringsData(offices)
    buildLabels(offices)
  }, [offices])

  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.arcsData(arcs)
  }, [arcs])

  // Re-trigger the colour accessor when the parent's pointColor
  // function identity changes (open/closed flip on the hour). globe.gl
  // re-paints points only when pointsData ref changes OR a setter is
  // re-called, so we kick it explicitly.
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.pointColor((d: object) => pointColorRef.current(d as OfficePoint))
  }, [pointColor])

  // Refresh label text when labelMeta callback identity changes
  // (parent ticks `time` once a minute — a new closure means the
  // local time / open-or-closed state may have rolled over). Mutates
  // existing DOM nodes in place so we don't lose CSS transitions.
  useEffect(() => {
    for (const o of officesRef.current) {
      const el = labelElsRef.current.get(o.id)
      if (el) applyLabelMeta(o, el)
    }
  }, [labelMeta])

  /** Idempotent: ensures one HTML label DOM node per office, removes
   *  orphaned ones. Safe to call on every offices-array change. */
  function buildLabels(items: OfficePoint[]) {
    if (!overlayRef.current) return
    const ov = overlayRef.current
    const seen = new Set<string>()
    for (const o of items) {
      seen.add(o.id)
      let el = labelElsRef.current.get(o.id)
      if (!el) {
        el = document.createElement('div')
        el.className = 'tp-globe-label'
        el.innerHTML = `
          <div class="tp-globe-label-stem"></div>
          <div class="tp-globe-label-card">
            <span class="tp-globe-label-cc" data-tp-cc></span>
            <div class="tp-globe-label-info">
              <div class="tp-globe-label-city" data-tp-city></div>
              <div class="tp-globe-label-meta">
                <span class="tp-globe-label-dot"></span>
                <span data-tp-time></span>
              </div>
            </div>
          </div>
        `
        ov.appendChild(el)
        labelElsRef.current.set(o.id, el)
      }
      applyLabelMeta(o, el)
    }
    for (const [id, el] of labelElsRef.current) {
      if (!seen.has(id)) {
        el.remove()
        labelElsRef.current.delete(id)
      }
    }
  }

  function applyLabelMeta(o: OfficePoint, el: HTMLElement) {
    const m = labelMetaRef.current(o)
    el.dataset.tpStatus = m.status
    el.style.setProperty('--tp-status-color', m.statusColor)
    const cc = el.querySelector<HTMLElement>('[data-tp-cc]')
    if (cc) {
      cc.textContent = m.countryCode
      cc.style.display = m.countryCode ? '' : 'none'
    }
    const city = el.querySelector<HTMLElement>('[data-tp-city]')
    if (city) city.textContent = m.city
    const time = el.querySelector<HTMLElement>('[data-tp-time]')
    if (time) time.textContent = m.localTime
  }

  /**
   * Per-frame sync: project each office to screen space, decide whether
   * it sits on the visible hemisphere (dot product > 0.18 — a small
   * positive bias hides labels that would skim the horizon and look
   * crowded against the rim), then place card+stem with a screen-space
   * collision pass that lifts overlapping labels by raising their stem
   * height. HQ wins ties so it always sits closest to its pin.
   */
  function positionLabels() {
    const g = globeRef.current
    const ov = overlayRef.current
    if (!g || !ov) return

    const camera = g.camera()
    const cd = camera.position
    const cdLen = Math.hypot(cd.x, cd.y, cd.z) || 1
    const cdx = cd.x / cdLen
    const cdy = cd.y / cdLen
    const cdz = cd.z / cdLen

    interface Entry {
      el: HTMLElement
      x: number
      y: number
      visible: boolean
      priority: number
      cardW: number
      cardH: number
    }
    const entries: Entry[] = []

    for (const o of officesRef.current) {
      const el = labelElsRef.current.get(o.id)
      if (!el) continue
      const u = unitCart(o.lat, o.lng)
      const dot = u.x * cdx + u.y * cdy + u.z * cdz
      const visible = dot > 0.18
      let coords: { x: number; y: number } | null = null
      try {
        coords = g.getScreenCoords(o.lat, o.lng, PIN_ALT)
      } catch {
        coords = null
      }
      if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) {
        el.style.opacity = '0'
        continue
      }
      // Measure on the fly — card width tracks the city name length.
      // Falls back to a generous default if the rect hasn't settled
      // (first frame after build, usually).
      const cardEl = el.querySelector<HTMLElement>('.tp-globe-label-card')
      let cardW = 130
      let cardH = 30
      if (cardEl) {
        const r = cardEl.getBoundingClientRect()
        if (r.width) cardW = r.width
        if (r.height) cardH = r.height
      }
      entries.push({
        el,
        x: coords.x,
        y: coords.y,
        visible,
        priority: o.isHq ? 2 : 1,
        cardW,
        cardH,
      })
    }

    // HQ first, then by ascending screen y (top → bottom). Top-most
    // gets first claim on its slot; later labels lift if they collide.
    entries.sort((a, b) => b.priority - a.priority || a.y - b.y)

    const placed: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const e of entries) {
      const baseStemH = 28
      let stemH = baseStemH
      const cardLeft = e.x - e.cardW / 2
      let cardTop = e.y - stemH - e.cardH
      let attempts = 0
      while (attempts < 8) {
        const collides = placed.some(
          p =>
            cardLeft < p.x + p.w + 6 &&
            cardLeft + e.cardW > p.x - 6 &&
            cardTop < p.y + p.h + 4 &&
            cardTop + e.cardH > p.y - 4,
        )
        if (!collides) break
        stemH += e.cardH + 6
        cardTop = e.y - stemH - e.cardH
        attempts++
      }
      placed.push({ x: cardLeft, y: cardTop, w: e.cardW, h: e.cardH })
      e.el.style.transform = `translate3d(${e.x}px, ${e.y}px, 0)`
      e.el.style.setProperty('--tp-stem-h', `${stemH}px`)
      e.el.style.opacity = e.visible ? '1' : '0'
    }
  }

  return (
    <div className="absolute inset-0" aria-label="Verdensglobus med kontorer">
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ background: '#000' }}
      />
      {/* HTML label overlay — sibling of the WebGL canvas, layered on
          top. pointer-events:none so hovers fall through to globe.gl's
          own pin tooltip. overflow:hidden clips labels that get pushed
          off-screen during collision lift-up. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: 'hidden' }}
      />
    </div>
  )
}
