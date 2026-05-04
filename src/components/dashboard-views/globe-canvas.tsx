'use client'

import { useEffect, useRef } from 'react'
import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {
  buildAuroraLayer,
  buildCloudLayer,
  buildDayNightMaterial,
  buildPinMesh,
  buildShootingStars,
  findGlobeMesh,
  sunDirectionAt,
  type PinHandle,
} from './globe-effects'

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
  // Pin-mesh-håndtak per kontor — lar pointColor-effekten oppdatere
  // farge in-place uten å bygge mesh-en på nytt (som ville flikke
  // bloomen og stjele en frame).
  const pinHandlesRef = useRef(new Map<string, PinHandle>())

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
        // ── Office pins som premium 3-lags ikoner ───────────────
        // Vi forbigår globe.gl sine default-kapsler (de leste som
        // tannpasta-tubes på TV-en). I stedet bruker vi `objectsData`
        // og bygger hver pin som en three.js-mesh: lyssterk kjerne +
        // myk halo som bloomen kan smøre på + tynn stem ned mot
        // overflaten. HQ får i tillegg en gull-stjerne. Mesh-ene
        // tracks i pinHandlesRef så fargen kan endres in-place når
        // et kontor flipper status (åpen → stengt på timetimer).
        .objectLat('lat')
        .objectLng('lng')
        .objectAltitude(PIN_ALT)
        .objectThreeObject((d: object) => {
          const o = d as OfficePoint
          const handle = buildPinMesh({
            isHq: o.isHq,
            hex: pointColorRef.current(o),
          })
          pinHandlesRef.current.set(o.id, handle)
          return handle.group
        })
        .objectLabel((d: object) => pointLabelRef.current(d as OfficePoint))
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
      g.objectsData(offices)
      g.ringsData(offices)
      g.arcsData(arcs)

      // Initial camera + auto-rotate speed. controls() returns the
      // OrbitControls instance — three.js convention. Auto-rotate
      // skrur vi av fordi kamera-koreografien lenger nede tar over
      // (drifter mellom kontorer i stedet for konstant spinn).
      g.pointOfView(initialView, 0)
      const controls = g.controls()
      controls.autoRotate = false
      // Disable user interaction — TV surface is read-only and we
      // don't want a cleaner bumping the camera off-axis.
      controls.enableZoom = false
      controls.enablePan = false
      controls.enableRotate = false
      // autoRotateSpeed beholdes i prop-API for bakoverkompatibilitet
      // men brukes ikke når koreografien er aktiv.
      void autoRotateSpeed

      globeRef.current = g

      // ── WOW-effekter ─────────────────────────────────────────
      // Hver effekt sitter i sin egen try/catch så en shader-feil
      // (manglende WebGL-extension etc.) ikke tar ned hele scenen —
      // pin/arc/ring-lagene drives uavhengig av disse.
      const scene = g.scene()
      const renderer = g.renderer()

      // Globe-radius for sky/aurora-skalering. three-globe bruker 100
      // i default; les fra mesh-en så koden står seg om libben endrer
      // konvensjon i fremtiden.
      const earthMesh = findGlobeMesh(scene)
      let globeRadius = 100
      if (earthMesh && earthMesh.geometry instanceof THREE.SphereGeometry) {
        globeRadius = earthMesh.geometry.parameters.radius
      }

      // 1) Dag/natt-shader på selve globen.
      let dayNight: ReturnType<typeof buildDayNightMaterial> | null = null
      try {
        if (earthMesh) {
          dayNight = buildDayNightMaterial()
          earthMesh.material = dayNight.material
          dayNight.setSunDir(sunDirectionAt(new Date()))
        }
      } catch (err) {
        console.warn('[globe] day/night shader failed:', err)
      }

      // 2) Volumetriske skyer
      let clouds: ReturnType<typeof buildCloudLayer> | null = null
      try {
        clouds = buildCloudLayer(globeRadius)
        scene.add(clouds.mesh)
      } catch (err) {
        console.warn('[globe] clouds failed:', err)
      }

      // 3) Nordlys
      let aurora: ReturnType<typeof buildAuroraLayer> | null = null
      try {
        aurora = buildAuroraLayer(globeRadius)
        scene.add(aurora.group)
      } catch (err) {
        console.warn('[globe] aurora failed:', err)
      }

      // 4) Stjerneskudd langt bak globen.
      let shooters: ReturnType<typeof buildShootingStars> | null = null
      try {
        shooters = buildShootingStars()
        scene.add(shooters.group)
      } catch (err) {
        console.warn('[globe] shooting stars failed:', err)
      }

      // 5) Bloom-postprocessing — mild så pin-glød og nordlys leser
      // filmisk uten å tåkelegge tekst i HUD-kortene over canvas.
      try {
        const composer = g.postProcessingComposer()
        const size = renderer.getSize(new THREE.Vector2())
        const bloom = new UnrealBloomPass(
          new THREE.Vector2(size.x, size.y),
          0.45, // strength
          0.6,  // radius
          0.85, // threshold — kun lyseste piksler bloomer
        )
        composer.addPass(bloom)
      } catch (err) {
        console.warn('[globe] bloom failed:', err)
      }

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
      // Kamera-koreografi: drift mellom kontorer i 9-sek-segmenter
      // med 3 sek hold på hver. Vision Pro-environment-stil — øyet
      // får tid til å lese byen før vi glir videre. Bruker korteste
      // vinkel-arc for lengdegrad så vi aldri panner gjennom bak-
      // siden av globen.
      const initialPose = { ...initialView }
      interface Segment {
        startTime: number
        durationMs: number
        from: { lat: number; lng: number; altitude: number }
        to: { lat: number; lng: number; altitude: number }
      }
      let segment: Segment | null = null
      let nextOfficeIdx = 0

      function pickNextTarget(): { lat: number; lng: number; altitude: number } {
        const list = officesRef.current
        if (list.length === 0) return { ...initialPose }
        const target = list[nextOfficeIdx % list.length]
        nextOfficeIdx++
        // Hold litt sør for kontoret så pinnen sitter midt i øvre
        // tredjedel av rammen — leser som «kontoret er der oppe» og
        // lar HUD-kortene puste på bunnen. Altitude 0.55 matcher
        // initialView i globe-view.tsx — koreografien holder samme
        // zoom-nivå hele veien så vi ikke pumper inn/ut og bryter
        // illusjonen.
        return { lat: target.lat - 6, lng: target.lng, altitude: 0.55 }
      }

      function shortestLngDelta(from: number, to: number): number {
        let d = to - from
        while (d > 180) d -= 360
        while (d < -180) d += 360
        return d
      }

      function easeInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      }

      function startSegment(now: number) {
        const g2 = globeRef.current
        if (!g2) return
        const current = g2.pointOfView()
        const target = pickNextTarget()
        segment = {
          startTime: now,
          durationMs: 9000,
          from: { lat: current.lat, lng: current.lng, altitude: current.altitude },
          to: target,
        }
      }

      let raf = 0
      let lastT = performance.now()
      let totalT = 0
      const tick = () => {
        const nowMs = performance.now()
        const dt = Math.min(0.1, (nowMs - lastT) / 1000)
        lastT = nowMs
        totalT += dt

        // Sol-retning hver frame — solen flytter seg bare ~0.004°/sek,
        // men gratis å pushe og holder terminator smooth.
        const sun = sunDirectionAt(new Date())
        if (dayNight) dayNight.setSunDir(sun)
        if (clouds) clouds.setSunDir(sun)

        // Tikke effekter
        if (clouds) clouds.tick(dt, totalT)
        if (aurora) aurora.tick(dt, totalT)
        if (shooters) shooters.tick(dt, totalT)

        // Kamera-koreografi
        const g2 = globeRef.current
        if (g2 && officesRef.current.length > 0) {
          if (!segment) {
            startSegment(nowMs)
          } else {
            const t = (nowMs - segment.startTime) / segment.durationMs
            if (t >= 1) {
              // Hold på målet i 3 sek (33% av segment-lengden) før
              // vi glir videre.
              if (t >= 1 + 3000 / segment.durationMs) {
                startSegment(nowMs)
              } else {
                g2.pointOfView({ ...segment.to }, 0)
              }
            } else {
              const e = easeInOut(t)
              const lngDelta = shortestLngDelta(segment.from.lng, segment.to.lng)
              g2.pointOfView(
                {
                  lat: segment.from.lat + (segment.to.lat - segment.from.lat) * e,
                  lng: segment.from.lng + lngDelta * e,
                  altitude:
                    segment.from.altitude +
                    (segment.to.altitude - segment.from.altitude) * e,
                },
                0,
              )
            }
          }
        }

        positionLabels()
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        // Slipp WOW-effekt-ressursene før globe.gl sin destructor —
        // material/geometry på sky/aurora/shooters er våre, ikke
        // libben sitt, og lever ellers videre gjennom GC-syklusen.
        const disposeTree = (m: THREE.Object3D) => {
          m.traverse(child => {
            const mesh = child as THREE.Mesh | THREE.Line
            const geom = (mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
            if (geom && 'dispose' in geom) geom.dispose()
            const mat = (mesh as THREE.Mesh).material
            if (mat) {
              if (Array.isArray(mat)) mat.forEach(m => m.dispose())
              else (mat as THREE.Material).dispose()
            }
          })
        }
        if (clouds) {
          scene.remove(clouds.mesh)
          disposeTree(clouds.mesh)
        }
        if (aurora) {
          scene.remove(aurora.group)
          disposeTree(aurora.group)
        }
        if (shooters) {
          scene.remove(shooters.group)
          disposeTree(shooters.group)
        }
        if (dayNight) dayNight.material.dispose()
        // Pin-meshes — hver pin har egne geometrier og materialer
        // som globe.gl ikke vet om, så vi må disposere dem her før
        // libben river ned WebGL-konteksten.
        for (const handle of pinHandlesRef.current.values()) {
          handle.group.traverse(child => {
            const mesh = child as THREE.Mesh | THREE.Line
            const geom = (mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
            if (geom && 'dispose' in geom) geom.dispose()
            const mat = (mesh as THREE.Mesh).material
            if (mat) {
              if (Array.isArray(mat)) mat.forEach(m => m.dispose())
              else (mat as THREE.Material).dispose()
            }
          })
        }
        pinHandlesRef.current.clear()
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
    // Når offices-listen endres må vi rydde i pin-handle-cachen
    // (ellers vokser den ubegrenset etter hvert som kontorer
    // legges til/fjernes). objectThreeObject bygger nye meshes for
    // nye/endrede ID-er; slettede ID-er må vi disposere selv.
    const incomingIds = new Set(offices.map(o => o.id))
    for (const [id, handle] of pinHandlesRef.current) {
      if (!incomingIds.has(id)) {
        handle.group.traverse(child => {
          const mesh = child as THREE.Mesh | THREE.Line
          const geom = (mesh as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
          if (geom && 'dispose' in geom) geom.dispose()
          const mat = (mesh as THREE.Mesh).material
          if (mat) {
            if (Array.isArray(mat)) mat.forEach(m => m.dispose())
            else (mat as THREE.Material).dispose()
          }
        })
        pinHandlesRef.current.delete(id)
      }
    }
    g.objectsData(offices)
    g.ringsData(offices)
    buildLabels(offices)
  }, [offices])

  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.arcsData(arcs)
  }, [arcs])

  // Når pointColor-callbacken endrer identitet (parent har tikket
  // `time` og åpen/stengt-statusen kan ha flipped), oppdaterer vi
  // hver pin in-place via håndtaket fra `buildPinMesh`. Det er
  // billigere enn å re-bygge object-meshene og unngår en kortvarig
  // bloom-flikk når geometrien re-mountes.
  useEffect(() => {
    for (const o of officesRef.current) {
      const handle = pinHandlesRef.current.get(o.id)
      if (handle) handle.setColor(pointColor(o))
    }
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

    // ── Radial fan-out fra klyngesentrum ────────────────────────
    // Tette klynger (CalWins Skandinavia-base) blir helt uleselig
    // hvis vi stabler labelene rett opp — hver label havner i kø
    // på toppen av den forrige, koblet via en lang vertikal stem.
    // Dette er den klassiske «labelliste lønnsslip»-effekten.
    //
    // I stedet beregner vi tyngdepunktet av alle synlige pins i
    // skjermrom, og vifter hver label utover langs vektoren fra
    // centroid → pin. Resultatet leser som blomsterblader fra et
    // sentrum, ikke en stabel: tette pins får distinkte, divergente
    // retninger, mens spredte pins beholder sin naturlige posisjon
    // (vektoren er da bare lenger ut og labelen ender uansett over
    // pinnen sin).
    const visibleEntries = entries.filter(e => e.visible)
    let cx = 0
    let cy = 0
    if (visibleEntries.length > 0) {
      for (const e of visibleEntries) {
        cx += e.x
        cy += e.y
      }
      cx /= visibleEntries.length
      cy /= visibleEntries.length
    }

    // Sortering: HQ først, deretter nærmest centroid først. Det gir
    // de innerste pinene i en klynge prioritet på sine «naturlige»
    // korte radier — ytre pins får uansett god plass lenger ute.
    entries.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      const da = Math.hypot(a.x - cx, a.y - cy)
      const db = Math.hypot(b.x - cx, b.y - cy)
      return da - db
    })

    const PIN_GAP = 18
    const CARD_GAP = 10
    // Radier vi prøver i økende rekkefølge før vi gir opp. Mer enn
    // 5 pass blir dyrt per frame, men tette CalWin-klynger trenger
    // 3–4 før de finner ledig plass.
    const RADIUS_STEPS = [1.0, 1.6, 2.4, 3.4, 4.6]
    // Når et kort havner direkte på centroidet (single-pin eller pin
    // som tilfeldigvis sitter midt i klyngen), velg en N-vifte i
    // stedet for en degenerert null-vektor.
    const FALLBACK_ANGLES: number[] = []
    for (let i = 0; i < 8; i++) FALLBACK_ANGLES.push((i / 8) * Math.PI * 2 - Math.PI / 2)

    const placed: Array<{ x: number; y: number; w: number; h: number }> = []

    for (const e of entries) {
      if (!e.visible) {
        e.el.style.opacity = '0'
        continue
      }

      // Retning utover fra klyngesentrum. Hvis pinnen sitter ~på
      // centroidet (sjelden, men mulig ved single visible pin),
      // bruker vi en fallback-vifte.
      const vx0 = e.x - cx
      const vy0 = e.y - cy
      const vlen = Math.hypot(vx0, vy0)
      const baseUx = vlen > 0.5 ? vx0 / vlen : 0
      const baseUy = vlen > 0.5 ? vy0 / vlen : -1
      const baseAngle = Math.atan2(baseUy, baseUx)

      // For hver pin prøver vi hovedvektoren først, så litt rotert
      // til hver side hvis kollisjon. Det gir lokal «justering»
      // uten å forlate radial-grunnformen. I siste fallback prøver
      // vi de 8 kompass-vinklene — en pin som ikke får plass noe
      // sted i klyngen vil i hvert fall finne et hjørne.
      const angleOffsets = [0, -0.35, 0.35, -0.7, 0.7, -1.05, 1.05]

      let chosenDx = 0
      let chosenDy = 0
      let found = false

      outer: for (const scale of RADIUS_STEPS) {
        for (const off of angleOffsets) {
          const a = baseAngle + off
          const ux = Math.cos(a)
          const uy = Math.sin(a)
          const r = (e.cardW / 2 + PIN_GAP) * scale
          const dx = ux * r
          const dy = uy * r
          const cardLeft = e.x + dx - e.cardW / 2
          const cardTop = e.y + dy - e.cardH / 2
          const collides = placed.some(
            p =>
              cardLeft < p.x + p.w + CARD_GAP &&
              cardLeft + e.cardW > p.x - CARD_GAP &&
              cardTop < p.y + p.h + CARD_GAP &&
              cardTop + e.cardH > p.y - CARD_GAP,
          )
          if (!collides) {
            chosenDx = dx
            chosenDy = dy
            found = true
            break outer
          }
        }
      }
      if (!found) {
        // Siste forsøk: 8 kompass-retninger på største radius. Hvis
        // selv det ikke gir plass, skjul labelen i stedet for å
        // tegne den oppå et annet kort.
        for (const a of FALLBACK_ANGLES) {
          const r = (e.cardW / 2 + PIN_GAP) * 4.6
          const dx = Math.cos(a) * r
          const dy = Math.sin(a) * r
          const cardLeft = e.x + dx - e.cardW / 2
          const cardTop = e.y + dy - e.cardH / 2
          const collides = placed.some(
            p =>
              cardLeft < p.x + p.w + CARD_GAP &&
              cardLeft + e.cardW > p.x - CARD_GAP &&
              cardTop < p.y + p.h + CARD_GAP &&
              cardTop + e.cardH > p.y - CARD_GAP,
          )
          if (!collides) {
            chosenDx = dx
            chosenDy = dy
            found = true
            break
          }
        }
      }
      if (!found) {
        e.el.style.opacity = '0'
        continue
      }

      const cardLeft = e.x + chosenDx - e.cardW / 2
      const cardTop = e.y + chosenDy - e.cardH / 2
      placed.push({ x: cardLeft, y: cardTop, w: e.cardW, h: e.cardH })

      // Stem-lengde = avstand fra pin til kortets nærmeste kant.
      // Stem-vinkelen peker fra pin → kortets sentrum, så linjen
      // treffer kortet midt i siden. Solver same edge-fraction-
      // logikken som compass-versjonen brukte: card er en
      // axis-aligned boks rundt (chosenDx, chosenDy), pin sitter i
      // origo; boksen treffes først der hvor den minste av
      // halfW/|dx| og halfH/|dy| skjærer.
      let edgeFraction = 1
      const halfW = e.cardW / 2
      const halfH = e.cardH / 2
      if (chosenDx !== 0)
        edgeFraction = Math.min(edgeFraction, halfW / Math.abs(chosenDx))
      if (chosenDy !== 0)
        edgeFraction = Math.min(edgeFraction, halfH / Math.abs(chosenDy))
      const stemEndX = chosenDx * (1 - edgeFraction)
      const stemEndY = chosenDy * (1 - edgeFraction)
      const stemLen = Math.hypot(stemEndX, stemEndY)
      const stemAngleDeg = (Math.atan2(stemEndY, stemEndX) * 180) / Math.PI

      e.el.style.transform = `translate3d(${e.x}px, ${e.y}px, 0)`
      e.el.style.setProperty('--tp-card-dx', `${chosenDx}px`)
      e.el.style.setProperty('--tp-card-dy', `${chosenDy}px`)
      e.el.style.setProperty('--tp-stem-len', `${stemLen}px`)
      e.el.style.setProperty('--tp-stem-angle', `${stemAngleDeg}deg`)
      e.el.style.opacity = '1'
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
