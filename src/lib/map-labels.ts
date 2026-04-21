// Label placement helpers for dashboard map views.
//
// SVG text labels placed next to pins overlap badly when two cities are close
// together (e.g. Drammen/Fjerdingstad, Oslo/Asker). We solve this by:
//   1. Deflecting each label to the side with the most room.
//   2. If two pins are inside a tight radius, the label is placed at an
//      offset that prevents vertical collision.

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
 * neighbours. For each pin we start with a "below" placement, then if a
 * neighbour is also below within the collision radius, alternate sides.
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

  for (const p of sorted) {
    // Find already-placed neighbours within collision radius.
    const neighbours = placed.filter(pl => {
      const dx = pl.point.x - p.x
      const dy = pl.point.y - p.y
      return Math.sqrt(dx * dx + dy * dy) < collisionRadius
    })

    // Pick a side + slot that doesn't collide with neighbours.
    const candidates: Array<{ side: LabelSide; slot: number }> = [
      { side: 'bottom', slot: 0 },
      { side: 'top', slot: 0 },
      { side: 'right', slot: 0 },
      { side: 'left', slot: 0 },
      { side: 'bottom', slot: 1 },
      { side: 'top', slot: 1 },
    ]

    const taken = new Set(neighbours.map(n => `${n.side}:${n.slot}`))
    const pick = candidates.find(c => !taken.has(`${c.side}:${c.slot}`)) ?? candidates[0]

    const { labelX, labelY } = anchorFor(p, pick.side, pick.slot, gap, lineHeight)

    placed.push({
      point: p,
      labelX,
      labelY,
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
