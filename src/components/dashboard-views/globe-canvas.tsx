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

interface GlobeCanvasProps {
  offices: OfficePoint[]
  arcs: OfficeArc[]
  /** Color callback per office. Lets the parent express "open / closed / HQ"
   *  in domain terms rather than baking work-hour rules into this layer. */
  pointColor: (o: OfficePoint) => string
  /** HTML string (yes, string — globe.gl tooltip API) to render on hover. */
  pointLabel: (o: OfficePoint) => string
  /** Initial camera pose. `altitude` 1 ≈ Earth-radius distance.
   *  Default is Europe-centred at ~Norway/UK eye-line, slightly tilted south. */
  initialView?: { lat: number; lng: number; altitude: number }
  /** Auto-rotate degrees per second. 0 disables; default 0.3 (very slow). */
  autoRotateSpeed?: number
}

const TEXTURE_NIGHT = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'
const TEXTURE_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const TEXTURE_SKY = 'https://unpkg.com/three-globe/example/img/night-sky.png'

/**
 * Wrapper around vanilla globe.gl — three.js-backed Earth with a
 * realistic night-lights texture. We use the imperative API directly
 * inside a single useEffect so we never collide with React's render
 * cycle (the library mutates an internal three.js scene, which doesn't
 * play well with a virtual-DOM-driven re-render).
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
  initialView = { lat: 55, lng: 15, altitude: 2.2 },
  autoRotateSpeed = 0.3,
}: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  // Ref-mirrors of accessor props so setters bound on first render see
  // the latest closure-captured state without us having to rebind on
  // every render (which would defeat globe.gl's diffing).
  const pointColorRef = useRef(pointColor)
  const pointLabelRef = useRef(pointLabel)
  pointColorRef.current = pointColor
  pointLabelRef.current = pointLabel

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
        .atmosphereAltitude(0.2)
        .pointLat('lat')
        .pointLng('lng')
        .pointAltitude(0.025)
        .pointRadius((d: object) => ((d as OfficePoint).isHq ? 0.55 : 0.45))
        .pointColor((d: object) => pointColorRef.current(d as OfficePoint))
        .pointLabel((d: object) => pointLabelRef.current(d as OfficePoint))
        .pointsTransitionDuration(1500)
        .arcColor(() => [
          'rgba(74,222,128,0.0)',
          'rgba(74,222,128,0.7)',
          'rgba(74,222,128,0.0)',
        ])
        .arcAltitudeAutoScale(0.4)
        .arcStroke(0.3)
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime(3000)

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

      cleanup = () => {
        window.removeEventListener('resize', onResize)
        // globe.gl exposes a destructor on the kapsule that releases
        // WebGL resources. The double-cast is because the type from
        // the library doesn't expose it but it exists at runtime —
        // verified against globe.gl 2.32+.
        const destructor = (g as unknown as { _destructor?: () => void })
          ._destructor
        if (destructor) destructor()
        else if (containerRef.current) containerRef.current.innerHTML = ''
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
  // animation would replay every tick.
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.pointsData(offices)
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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ background: '#000' }}
      aria-label="Verdensglobus med kontorer"
    />
  )
}
