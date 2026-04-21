'use client'

import { useEffect, useRef, useState } from 'react'
import { geocode } from '@/lib/geocode-client'

export interface ResolvedLocation {
  lat: number
  lng: number
  display: string
}

const STORAGE_KEY = 'teampulse:geocode-cache:v1'
const MAX_CACHE = 400

interface CachedEntry { lat: number; lng: number; display: string; ts: number }
type Cache = Record<string, CachedEntry>

function loadCache(): Cache {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Cache
  } catch {
    return {}
  }
}

function saveCache(cache: Cache) {
  if (typeof window === 'undefined') return
  try {
    // Prune old entries if over limit (oldest ts first).
    const entries = Object.entries(cache)
    if (entries.length > MAX_CACHE) {
      entries.sort((a, b) => b[1].ts - a[1].ts)
      const pruned: Cache = {}
      for (const [k, v] of entries.slice(0, MAX_CACHE)) pruned[k] = v
      cache = pruned
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    /* ignore storage errors */
  }
}

function normalize(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Resolves a list of free-text location labels against a persistent
 * localStorage cache, falling back to `/api/geocode`. Returns a map
 * keyed by the original label. Labels already resolvable via the
 * static dictionary in @/lib/geo should be pre-filtered by the caller —
 * this hook only handles the long tail (e.g. "2817 Gjøvik").
 */
export function useResolvedLocations(labels: string[]): Map<string, ResolvedLocation> {
  const [resolved, setResolved] = useState<Map<string, ResolvedLocation>>(() => new Map())
  const inFlight = useRef<Set<string>>(new Set())

  // Stable key so we only re-run when the set of labels actually changes.
  const key = labels.map(normalize).filter(Boolean).sort().join('|')

  useEffect(() => {
    if (!labels.length) return
    const cache = loadCache()
    const next = new Map<string, ResolvedLocation>()
    const toFetch: string[] = []

    for (const label of labels) {
      const norm = normalize(label)
      if (!norm) continue
      const hit = cache[norm]
      if (hit) {
        next.set(label, { lat: hit.lat, lng: hit.lng, display: hit.display })
      } else if (!inFlight.current.has(norm)) {
        toFetch.push(label)
      }
    }

    setResolved(next)

    if (!toFetch.length) return
    let cancelled = false
    ;(async () => {
      // Stagger requests slightly so we stay under Nominatim's 1 req/s.
      for (const label of toFetch) {
        if (cancelled) return
        const norm = normalize(label)
        inFlight.current.add(norm)
        try {
          const hit = await geocode({ query: label })
          if (cancelled) return
          if (hit) {
            const entry: CachedEntry = {
              lat: hit.lat,
              lng: hit.lng,
              display: hit.city || hit.displayName.split(',')[0].trim() || label,
              ts: Date.now(),
            }
            const current = loadCache()
            current[norm] = entry
            saveCache(current)
            setResolved(prev => {
              const m = new Map(prev)
              m.set(label, { lat: entry.lat, lng: entry.lng, display: entry.display })
              return m
            })
          }
        } catch {
          /* swallow — unresolved labels stay in the sidebar */
        } finally {
          inFlight.current.delete(norm)
        }
        await new Promise(r => setTimeout(r, 1100))
      }
    })()

    return () => { cancelled = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return resolved
}
