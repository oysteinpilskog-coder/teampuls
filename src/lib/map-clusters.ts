// Proximity clustering for dashboard map pins.
//
// When customers sit close together (Oslo sentrum, Göteborg-bandet,
// Stockholm + Uppsala) individual pins overlap visually — auras blend, the
// label-collision-solver runs out of slots, and the map starts to feel
// chaotic on a TV screen. This helper folds nearby points into a single
// "nucleus" cluster, anchored on the highest-priority member, with the
// other members carried along for the rotating ticker label.
//
// Greedy seed-and-attach: points are sorted by tier (today → week → idle)
// and visit count, so the most-important pin in each neighbourhood becomes
// the cluster anchor. Lower-priority neighbours within `threshold` SVG
// units fold in. The anchor's coordinates are kept as-is — the cluster
// reads cartographically as "the prominent customer", with the badge
// signalling that more sit in the same area.

export type CustomerPinState = 'idle' | 'week' | 'today'

export interface ClusterMember {
  /** Display name shown in the rotating label. */
  name: string
  state: CustomerPinState
  visitCount: number
}

export interface ClusterableInput {
  id: string
  x: number
  y: number
  radius: number
  display: string
  state: CustomerPinState
  visitCount: number
}

export interface MapCluster {
  /** Stable id — the seed point's id. Survives re-renders cleanly. */
  id: string
  /** Anchor coords = the seed pin's coords (NOT a moving centroid).
   *  Keeps the cluster locked to the most-important customer's location. */
  x: number
  y: number
  radius: number
  /** Highest-tier state across all members. */
  state: CustomerPinState
  /** Sum of visit counts across members. */
  visitCount: number
  /** Members ordered by importance — index 0 is the "primary" name. */
  members: ClusterMember[]
}

const TIER_RANK: Record<CustomerPinState, number> = { today: 0, week: 1, idle: 2 }

/**
 * Cluster pins whose centres are within `threshold` SVG units. Threshold
 * defaults to 24 — roughly the visual aura overlap zone for our 4-5 px pin
 * radii on the 1400×900 Europe canvas.
 */
export function clusterMapPoints<T extends ClusterableInput>(
  points: T[],
  threshold = 24,
): MapCluster[] {
  const sorted = [...points].sort((a, b) => {
    const ta = TIER_RANK[a.state]
    const tb = TIER_RANK[b.state]
    if (ta !== tb) return ta - tb
    if (a.visitCount !== b.visitCount) return b.visitCount - a.visitCount
    return a.display.localeCompare(b.display)
  })

  interface Bucket {
    seedId: string
    centerX: number
    centerY: number
    radius: number
    bestState: CustomerPinState
    visitCount: number
    members: ClusterMember[]
  }

  const buckets: Bucket[] = []
  const t2 = threshold * threshold

  for (const p of sorted) {
    let host: Bucket | null = null
    for (const b of buckets) {
      const dx = b.centerX - p.x
      const dy = b.centerY - p.y
      if (dx * dx + dy * dy < t2) {
        host = b
        break
      }
    }
    if (host) {
      host.members.push({ name: p.display, state: p.state, visitCount: p.visitCount })
      host.visitCount += p.visitCount
      if (TIER_RANK[p.state] < TIER_RANK[host.bestState]) host.bestState = p.state
      if (p.radius > host.radius) host.radius = p.radius
    } else {
      buckets.push({
        seedId: p.id,
        centerX: p.x,
        centerY: p.y,
        radius: p.radius,
        bestState: p.state,
        visitCount: p.visitCount,
        members: [{ name: p.display, state: p.state, visitCount: p.visitCount }],
      })
    }
  }

  return buckets.map(b => ({
    id: b.seedId,
    x: b.centerX,
    y: b.centerY,
    radius: b.radius,
    state: b.bestState,
    visitCount: b.visitCount,
    members: b.members,
  }))
}
