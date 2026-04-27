// Label placement helpers for dashboard map views.
//
// SVG text labels placed next to pins overlap badly when two cities are close
// together (e.g. Drammen/Fjerdingstad, Oslo/Asker, Vestfossen/Gjøvik). For each
// pin we score every candidate side+slot by the minimum distance from the
// label anchor to nearby neighbour pins *and* their already-placed labels —
// the highest-scoring candidate wins, with a small tie-break that prefers
// `bottom` for isolated pins (the historical default).

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
}

/**
 * Resolve label positions for a set of pins, avoiding collisions between
 * neighbours. For each pin we score candidate placements by how far the
 * label sits from nearby neighbour pins and their labels — the candidate
 * that maximises the minimum distance wins. Isolated pins fall through to
 * `bottom:0` via the tie-break.
 */
export function placeLabels<T extends LabeledPoint>(
  points: T[],
  opts: PlaceOptions = {},
): PlacedLabel<T>[] {
  const gap = opts.gap ?? 14
  const lineHeight = opts.lineHeight ?? 22
  const collisionRadius = opts.collisionRadius ?? 90

  // Sort by y so "upper" pins resolve first — gives a stable ordering.
  const sorted = [...points].sort((a, b) => a.y - b.y)
  const placed: PlacedLabel<T>[] = []

  const candidates: Array<{ side: LabelSide; slot: number }> = [
    { side: 'bottom', slot: 0 },
    { side: 'top', slot: 0 },
    { side: 'right', slot: 0 },
    { side: 'left', slot: 0 },
    { side: 'bottom', slot: 1 },
    { side: 'top', slot: 1 },
  ]

  // Two label anchors must be at least this far apart to avoid visual
  // collision. Roughly one line-height + a small breathing margin —
  // tighter and labels start kissing each other; looser and well-separated
  // pins get pushed into wide-orbit slots unnecessarily.
  const safeDistance = lineHeight + 4

  for (const p of sorted) {
    // Find already-placed neighbours within collision radius.
    const neighbours = placed.filter(pl => {
      const dx = pl.point.x - p.x
      const dy = pl.point.y - p.y
      return Math.sqrt(dx * dx + dy * dy) < collisionRadius
    })

    type Resolved = { side: LabelSide; slot: number; labelX: number; labelY: number; score: number }
    let best: Resolved | null = null
    let firstSafe: Resolved | null = null

    for (const c of candidates) {
      const { labelX, labelY } = anchorFor(p, c.side, c.slot, gap, lineHeight)

      // Distance from this candidate's anchor to every neighbour pin AND
      // every neighbour's already-placed label. A candidate side that
      // "faces" a neighbour scores low because the label lands on top of
      // that neighbour's pin or label.
      let minDist = Infinity
      for (const n of neighbours) {
        const dPin = Math.hypot(n.point.x - labelX, n.point.y - labelY)
        const dLabel = Math.hypot(n.labelX - labelX, n.labelY - labelY)
        if (dPin < minDist) minDist = dPin
        if (dLabel < minDist) minDist = dLabel
      }

      const resolved: Resolved = { side: c.side, slot: c.slot, labelX, labelY, score: minDist }

      // Pick the FIRST candidate (in priority order) that clears the safe
      // distance — keeps natural bottom-of-pin placement whenever there's
      // room, only deflecting when neighbours genuinely block the slot.
      if (firstSafe === null && minDist >= safeDistance) {
        firstSafe = resolved
      }
      if (!best || minDist > best.score) {
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
