// Resolve a free-text location_label against the org's customer registry.
//
// Matching rules (most specific wins):
//   1. Exact case-insensitive match on `name`
//   2. Exact case-insensitive match on any `alias`
//   3. The longest customer name/alias that appears as a substring of the
//      label (so "Diplomat Skøyen" still matches the customer "Diplomat")
//
// Returns null when nothing matches — the caller falls through to the
// city dictionary and then to Nominatim.

import type { Customer } from '@/lib/supabase/types'

export interface ResolvedCustomer {
  customer: Customer
  lat: number
  lng: number
  display: string
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveCustomer(
  label: string | null | undefined,
  customers: Customer[],
): ResolvedCustomer | null {
  if (!label) return null
  const folded = fold(label)
  if (!folded) return null

  // Pre-build a folded index for this call. Small lists, cheap to rebuild.
  const index: Array<{ key: string; customer: Customer }> = []
  for (const c of customers) {
    if (c.latitude == null || c.longitude == null) continue
    index.push({ key: fold(c.name), customer: c })
    for (const alias of c.aliases ?? []) {
      const k = fold(alias)
      if (k) index.push({ key: k, customer: c })
    }
  }

  // 1–2: exact match on name or alias
  const exact = index.find(e => e.key === folded)
  if (exact) {
    return {
      customer: exact.customer,
      lat: exact.customer.latitude!,
      lng: exact.customer.longitude!,
      display: exact.customer.name,
    }
  }

  // 3: longest substring match
  let best: { entry: typeof index[number]; length: number } | null = null
  for (const e of index) {
    if (e.key.length < 3) continue     // avoid matching "as", "nr", …
    if (folded.includes(e.key) && (!best || e.key.length > best.length)) {
      best = { entry: e, length: e.key.length }
    }
  }
  if (best) {
    return {
      customer: best.entry.customer,
      lat: best.entry.customer.latitude!,
      lng: best.entry.customer.longitude!,
      display: best.entry.customer.name,
    }
  }

  return null
}
