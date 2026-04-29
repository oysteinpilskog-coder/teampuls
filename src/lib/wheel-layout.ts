// Layout pre-pass for year-wheel events: assigns sub-rows within a ring
// (so date-overlapping events render as parallel arcs instead of stacking
// on top of each other) and callout rows for narrow events whose label
// arcs would otherwise collide angularly.
//
// Pure data — no React, no SVG. The wheel imports `computeEventLayout`
// once per render and reads the resulting Map when drawing each event.

import { R } from '@/lib/wheel-geometry'

// ─── Inputs ───────────────────────────────────────────────────────

export type LayoutInput = {
  id: string
  ringIdx: 0 | 1 | 2
  startDeg: number
  endDeg: number
  titleLen: number
}

export type LayoutInfo = {
  // null = use the ring's full radial width (no neighbor in this ring).
  // 0 / 1 = outer / inner sub-row, used when neighbors collide.
  subRow: 0 | 1 | null
  // null = no callout slot needed (event is wide enough for tangential
  // label, OR no label fits at all). 0 = inner callout arc, 1 = outer.
  calloutRow: 0 | 1 | null
  // The widget rendered an arc but the inline label was suppressed.
  // Caller should fall back to the callout treatment instead.
  suppressTangentialLabel: boolean
}

// ─── Constants ────────────────────────────────────────────────────

// Threshold below which a tangential label can't read on the arc and
// we fall back to a callout outside the month ring. Mirrors the value
// already used in year-wheel.tsx.
const NARROW_ARC_THRESHOLD_DEG = 3.5

// Two callout rows just outside the month ring. Row 0 is the existing
// position; row 1 sits ~14 px further out so two adjacent labels never
// overlap. Both stay inside the wheel SVG's outer padding (viewBox
// extends 28 px past R.monthOuter).
export const CALLOUT_ROW_0_R = R.monthOuter + 14
export const CALLOUT_ROW_1_R = R.monthOuter + 28

// Approximate per-character width on the callout arc, in px. Matches
// the label-width math already used in year-wheel.tsx defs.
const CALLOUT_CHAR_PX = 6.3
const CALLOUT_PADDING_PX = 12
const CALLOUT_MAX_CHARS = 18

// ─── Main entry ───────────────────────────────────────────────────

export function computeEventLayout(items: LayoutInput[]): Map<string, LayoutInfo> {
  const layout = new Map<string, LayoutInfo>()
  for (const it of items) {
    layout.set(it.id, { subRow: null, calloutRow: null, suppressTangentialLabel: false })
  }

  // ── Sub-rows per ring ───────────────────────────────────────────
  // Greedy first-fit by start angle. An event is only assigned a
  // sub-row if it actually has a neighbor it overlaps with — solo
  // events keep the full ring width so the wheel still feels open
  // when the calendar is sparse.
  for (const ringIdx of [0, 1, 2] as const) {
    const ringItems = items
      .filter(it => it.ringIdx === ringIdx)
      .sort((a, b) => a.startDeg - b.startDeg)

    const hasNeighbor = new Set<string>()
    for (let i = 0; i < ringItems.length; i++) {
      for (let j = i + 1; j < ringItems.length; j++) {
        const a = ringItems[i]
        const b = ringItems[j]
        if (b.startDeg >= a.endDeg) break
        if (a.startDeg < b.endDeg && b.startDeg < a.endDeg) {
          hasNeighbor.add(a.id)
          hasNeighbor.add(b.id)
        }
      }
    }

    const rowOccupancy: Array<Array<[number, number]>> = [[], []]
    for (const it of ringItems) {
      if (!hasNeighbor.has(it.id)) continue
      let placed: 0 | 1 | null = null
      for (const r of [0, 1] as const) {
        const overlaps = rowOccupancy[r].some(
          ([s, e]) => !(it.endDeg <= s || it.startDeg >= e),
        )
        if (!overlaps) {
          rowOccupancy[r].push([it.startDeg, it.endDeg])
          placed = r
          break
        }
      }
      if (placed === null) {
        const r: 0 | 1 = rowOccupancy[0].length <= rowOccupancy[1].length ? 0 : 1
        rowOccupancy[r].push([it.startDeg, it.endDeg])
        placed = r
      }
      const cur = layout.get(it.id)!
      layout.set(it.id, { ...cur, subRow: placed })
    }
  }

  // ── Callout rows (narrow events only) ───────────────────────────
  // Greedy first-fit by mid angle. The "label footprint" is computed
  // at the actual callout radius so wider labels reserve more arc.
  const calloutOccupancy: Array<Array<[number, number]>> = [[], []]
  const narrow = items
    .filter(it => it.endDeg - it.startDeg < NARROW_ARC_THRESHOLD_DEG)
    .map(it => ({ it, midDeg: (it.startDeg + it.endDeg) / 2 }))
    .sort((a, b) => a.midDeg - b.midDeg)

  for (const { it, midDeg } of narrow) {
    const chars = Math.min(it.titleLen, CALLOUT_MAX_CHARS)
    const labelPx = chars * CALLOUT_CHAR_PX + CALLOUT_PADDING_PX

    let placed: 0 | 1 | null = null
    for (const r of [0, 1] as const) {
      const radius = r === 0 ? CALLOUT_ROW_0_R : CALLOUT_ROW_1_R
      const labelDeg = (labelPx / radius) * (180 / Math.PI)
      const start = midDeg - labelDeg / 2
      const end = midDeg + labelDeg / 2
      const overlaps = calloutOccupancy[r].some(
        ([s, e]) => !(end <= s || start >= e),
      )
      if (!overlaps) {
        calloutOccupancy[r].push([start, end])
        placed = r
        break
      }
    }
    const cur = layout.get(it.id)!
    layout.set(it.id, { ...cur, calloutRow: placed })
  }

  return layout
}

// ─── Geometry helper ──────────────────────────────────────────────
// Translates a layout's `subRow` into actual ring bounds. Splits the
// ring into two nested halves with a tiny seam between them.

export function subRowBounds(
  ring: { outer: number; inner: number },
  subRow: 0 | 1 | null,
): { outer: number; inner: number; mid: number } {
  if (subRow === null) {
    const mid = (ring.outer + ring.inner) / 2
    return { outer: ring.outer, inner: ring.inner, mid }
  }
  const seam = (ring.outer + ring.inner) / 2
  const gap = 0.5
  if (subRow === 0) {
    const outer = ring.outer
    const inner = seam + gap
    return { outer, inner, mid: (outer + inner) / 2 }
  }
  const outer = seam - gap
  const inner = ring.inner
  return { outer, inner, mid: (outer + inner) / 2 }
}

// Callout-arc radius for a given row, exported so the wheel's <defs>
// and the leader-line can stay aligned.
export function calloutRadius(calloutRow: 0 | 1): number {
  return calloutRow === 0 ? CALLOUT_ROW_0_R : CALLOUT_ROW_1_R
}
