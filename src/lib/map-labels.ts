// Label placement helpers for dashboard map views.
//
// SVG text labels placed next to pins overlap badly when two cities are close
// together (Drammen/Fjerdingstad, Oslo/Asker, Lyngdal/Uddevalla, …). For each
// pin we score every candidate side+slot — the highest-scoring candidate wins,
// with a small tie-break that prefers `bottom` for isolated pins (the
// historical default).
//
// Two scoring modes:
//
//  • Anker-avstand (default, brukes av customer-map-view sine SVG-text-labels
//    der box-bredden ikke er kjent på forhånd). Score = minste avstand fra
//    label-anker til nabopin og naboens label-anker.
//
//  • AABB-overlapp (når `labelWidth`/`labelHeight` er gitt — brukes av
//    office-map-view sine 360 px brede `<foreignObject>`-labels). Score
//    = minus den totale overlapp-arealet med naboers label-bokser eller
//    deres pinner. To nære pins som begge ville endt opp på `bottom:0`
//    detekteres her — den ene flyttes til neste kandidat (top, slot:1, …).

export interface LabeledPoint {
  id: string
  x: number
  y: number
  /** Size of the dot in px — labels are placed outside the halo. */
  radius: number
}

export type LabelSide = 'top' | 'bottom' | 'left' | 'right'

export interface PlacedLabel<T> {
  point: T & LabeledPoint
  /** Anchor position for the top line of the label. */
  labelX: number
  labelY: number
  /** Which side of the pin the label sits on (used for text-anchor). */
  side: LabelSide
  /** Vertical slot index (0 = aligned, 1/-1 = nudged). */
  slot: number
}

interface PlaceOptions {
  /** Gap between pin edge and label anchor. */
  gap?: number
  /** Vertical distance between label lines (title + sub). */
  lineHeight?: number
  /** Minimum horizontal distance before nearby labels collide. */
  collisionRadius?: number
  /** Bredde på label-boksen i px. Hvis satt brukes AABB-overlapp i stedet
   *  for ren anker-avstand — gir korrekt deteksjon for brede `<foreignObject>`-
   *  labels (som 360 px-vinduet i office-map). */
  labelWidth?: number
  /** Høyde på label-boksen i px. Må gis sammen med `labelWidth` for at
   *  AABB-modus skal aktiveres. */
  labelHeight?: number
}

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Resolve label positions for a set of pins, avoiding collisions between
 * neighbours. For each pin we score candidate placements by how far the
 * label sits from nearby neighbour pins and their labels — the candidate
 * that maximises the minimum distance (or minimises overlap area in
 * AABB-mode) wins. Isolated pins fall through to `bottom:0` via the
 * tie-break.
 */
export function placeLabels<T extends LabeledPoint>(
  points: T[],
  opts: PlaceOptions = {},
): PlacedLabel<T>[] {
  const gap = opts.gap ?? 14
  const lineHeight = opts.lineHeight ?? 22
  const collisionRadius = opts.collisionRadius ?? 90
  const aabbMode =
    typeof opts.labelWidth === 'number' && typeof opts.labelHeight === 'number'
  const labelWidth = opts.labelWidth ?? 0
  const labelHeight = opts.labelHeight ?? 0

  // Sort by y so "upper" pins resolve first — gives a stable ordering.
  const sorted = [...points].sort((a, b) => a.y - b.y)
  const placed: PlacedLabel<T>[] = []

  // Kandidatene prøves i prioritetsrekkefølge. `slot:2` for top/bottom er
  // siste utvei når både normal og slot:1 er tatt — sikrer at to pins som
  // ligger nær hverandre **alltid** finner et ikke-overlappende slot.
  const candidates: Array<{ side: LabelSide; slot: number }> = [
    { side: 'bottom', slot: 0 },
    { side: 'top', slot: 0 },
    { side: 'right', slot: 0 },
    { side: 'left', slot: 0 },
    { side: 'bottom', slot: 1 },
    { side: 'top', slot: 1 },
    { side: 'bottom', slot: 2 },
    { side: 'top', slot: 2 },
  ]

  // Anker-modus: to label-ankre må være minst så langt fra hverandre.
  // Roughly one line-height + a small breathing margin.
  const safeDistance = lineHeight + 4

  for (const p of sorted) {
    // Find already-placed neighbours within collision radius.
    const neighbours = placed.filter(pl => {
      const dx = pl.point.x - p.x
      const dy = pl.point.y - p.y
      return Math.sqrt(dx * dx + dy * dy) < collisionRadius
    })

    type Resolved = {
      side: LabelSide
      slot: number
      labelX: number
      labelY: number
      score: number
    }
    let best: Resolved | null = null
    let firstSafe: Resolved | null = null

    for (const c of candidates) {
      const { labelX, labelY } = anchorFor(p, c.side, c.slot, gap, lineHeight)

      let score: number
      let safe: boolean

      if (aabbMode) {
        // Bygg label-rektangel for denne kandidaten og sjekk overlapp mot
        // hver allerede-plasserte nabos label-boks samt naboens pin.
        // Score = -totalOverlap så høyere er bedre (ingen overlapp = 0).
        const myRect = labelRectFor(c.side, labelX, labelY, labelWidth, labelHeight)
        let totalOverlap = 0
        let pinHit = false
        for (const n of neighbours) {
          const nRect = labelRectFor(n.side, n.labelX, n.labelY, labelWidth, labelHeight)
          totalOverlap += rectOverlap(myRect, nRect)
          // Treat the neighbour pin as a small forbidden disc — labelet
          // skal aldri dekke en nabo-pin.
          if (pointInRect(n.point.x, n.point.y, myRect, n.point.radius + 2)) {
            pinHit = true
          }
        }
        score = -totalOverlap - (pinHit ? 1e6 : 0)
        safe = totalOverlap === 0 && !pinHit
      } else {
        // Eldre anker-distanse-modus, beholdt for kall-sider som ikke
        // gir labelWidth/labelHeight (customer-map-view bruker enkle
        // <text>-labels uten kjent bredde).
        let minDist = Infinity
        for (const n of neighbours) {
          const dPin = Math.hypot(n.point.x - labelX, n.point.y - labelY)
          const dLabel = Math.hypot(n.labelX - labelX, n.labelY - labelY)
          if (dPin < minDist) minDist = dPin
          if (dLabel < minDist) minDist = dLabel
        }
        score = minDist
        safe = minDist >= safeDistance
      }

      const resolved: Resolved = { side: c.side, slot: c.slot, labelX, labelY, score }

      // Pick the FIRST candidate (in priority order) that's safe — keeps
      // natural bottom-of-pin placement whenever there's room, only
      // deflecting when neighbours genuinely block the slot.
      if (firstSafe === null && safe) {
        firstSafe = resolved
      }
      if (!best || score > best.score) {
        best = resolved
      }
    }

    const pick = firstSafe ?? best!
    placed.push({
      point: p,
      labelX: pick.labelX,
      labelY: pick.labelY,
      side: pick.side,
      slot: pick.slot,
    })
  }

  return placed
}

/**
 * Bounding-rektangel for et label gitt anker, side og box-mål. Speiler
 * eksakt geometrien i `office-map-label.tsx`:
 *   - top/bottom: x sentrert på labelX, y starter ~62 % over labelY
 *   - left:       høyre kant ved labelX (label vokser mot venstre)
 *   - right:      venstre kant ved labelX (label vokser mot høyre)
 */
function labelRectFor(
  side: LabelSide,
  labelX: number,
  labelY: number,
  width: number,
  height: number,
): Rect {
  const top = labelY - height * 0.62
  const bottom = labelY + height * 0.38
  let left: number
  let right: number
  if (side === 'left') {
    left = labelX - width
    right = labelX
  } else if (side === 'right') {
    left = labelX
    right = labelX + width
  } else {
    left = labelX - width / 2
    right = labelX + width / 2
  }
  return { left, right, top, bottom }
}

function rectOverlap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const dy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return dx * dy
}

function pointInRect(x: number, y: number, r: Rect, padding = 0): boolean {
  return (
    x >= r.left - padding &&
    x <= r.right + padding &&
    y >= r.top - padding &&
    y <= r.bottom + padding
  )
}

function anchorFor(
  p: LabeledPoint,
  side: LabelSide,
  slot: number,
  gap: number,
  lineHeight: number,
): { labelX: number; labelY: number } {
  switch (side) {
    case 'bottom':
      return {
        labelX: p.x,
        labelY: p.y + p.radius + gap + slot * (lineHeight * 2 + 6),
      }
    case 'top':
      return {
        labelX: p.x,
        labelY: p.y - p.radius - gap - lineHeight - slot * (lineHeight * 2 + 6),
      }
    case 'right':
      return {
        labelX: p.x + p.radius + gap,
        labelY: p.y + 4 + slot * lineHeight * 2,
      }
    case 'left':
      return {
        labelX: p.x - p.radius - gap,
        labelY: p.y + 4 + slot * lineHeight * 2,
      }
  }
}

export function textAnchorFor(side: LabelSide): 'start' | 'middle' | 'end' {
  if (side === 'left') return 'end'
  if (side === 'right') return 'start'
  return 'middle'
}
