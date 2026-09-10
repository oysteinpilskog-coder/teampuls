'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Entry } from '@/lib/supabase/types'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

/**
 * Payload for the `teampulse:entries-changed` CustomEvent. Mutators that
 * already know the rows they wrote should attach them here so consumers
 * can patch local state in the same frame instead of refetching.
 */
export type EntryChangeDetail = {
  upserted?: Entry[]
  deletedIds?: string[]
}

/** Intervall for den stille reconciliation-runden mot serveren. */
const RECONCILE_MS = 5 * 60 * 1000

/**
 * Rad-for-rad-likhet på (id, updated_at) — nok til å avgjøre om et refetch
 * ga noe nytt. Rekkefølgen fra PostgREST er ikke garantert stabil, så vi
 * sammenligner sorterte nøkler, ikke posisjoner.
 */
function sameRows(a: Entry[], b: Entry[]): boolean {
  if (a.length !== b.length) return false
  const key = (rows: Entry[]) =>
    rows.map(r => `${r.id}|${r.updated_at}`).sort().join(',')
  return key(a) === key(b)
}

/** Helper so dispatchers don't have to reconstruct the event shape. */
export function dispatchEntriesChanged(detail?: EntryChangeDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<EntryChangeDetail | undefined>('teampulse:entries-changed', {
      detail,
    }),
  )
}

/**
 * Fetches entries for the given org(s) + date strings, and subscribes to
 * Supabase Realtime to keep the data live.
 *
 * Pass `orgIds: string[]` for combined views that span multiple
 * workspaces; for the single-org case continue passing one id.
 *
 * Optional `initial` lets the caller seed the hook with server-rendered
 * data. If provided AND the initial dateStrings match, the hook skips the
 * first client fetch entirely, avoiding the empty-to-populated flash on
 * cold loads.
 */
export function useEntries(
  orgIdOrIds: string | string[],
  dateStrings: string[],
  opts: { initial?: Entry[] } = {},
) {
  const orgIds = useMemo(
    () => (Array.isArray(orgIdOrIds) ? orgIdOrIds : [orgIdOrIds]),
    [orgIdOrIds],
  )
  const orgIdsKey = orgIds.join(',')

  const [entries, setEntries] = useState<Entry[]>(opts.initial ?? [])
  const [loading, setLoading] = useState(opts.initial === undefined)
  const visible = useDocumentVisibility()
  // Tracks whether the previous render was in the hidden state so we know
  // when to fire a catch-up fetch on resume — and avoid an extra fetch on
  // first mount (where the dedicated fetch effect already runs).
  const wasHiddenRef = useRef(false)

  // Record the dateStrings fingerprint of the initial data so we only skip
  // the first fetch when it's actually applicable. Subsequent week
  // navigations reset this and always go through the network.
  const initialKey = useRef<string | null>(opts.initial ? dateStrings.join(',') : null)

  // Keep a ref to the current date strings so the realtime callback
  // can check relevance without a stale closure.
  const dateStringsRef = useRef(dateStrings)
  useEffect(() => {
    dateStringsRef.current = dateStrings
  })

  // Re-fetch whenever the visible date range changes
  const dateStringsKey = dateStrings.join(',')
  const fetchEntries = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('entries')
      .select('*')
      .in('org_id', orgIds)
      .in('date', dateStrings)
    const next = data ?? []
    // Behold forrige referanse når radene er identiske. Den stille
    // reconciliation-en under fyrer hvert 5. minutt på en TV som ellers
    // ikke endrer seg — uten denne sjekken ville hver runde tvinge nye
    // memo-beregninger og re-render av hele dashbord-treet for ingenting.
    setEntries(prev => (sameRows(prev, next) ? prev : next))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey, dateStringsKey])

  useEffect(() => {
    const currentKey = dateStrings.join(',')
    if (initialKey.current && initialKey.current === currentKey) {
      // SSR data matches the current window — keep it, skip this fetch.
      initialKey.current = null
      setLoading(false)
      return
    }
    setLoading(true)
    fetchEntries()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchEntries])

  // Same-tab sync from mutations dispatched by AIInput, CellEditor, and the
  // sommer matrix. The dispatcher passes the rows it just wrote in
  // `event.detail` so we can patch local state in the same frame the user
  // hits Enter — no round-trip, no `select('*')` refetch, no spinner.
  // Legacy dispatchers without a detail payload fall back to refetch.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EntryChangeDetail | undefined>).detail
      if (!detail) {
        // Belt-and-braces refetch for callers that haven't migrated yet.
        fetchEntries()
        return
      }
      const upserts = detail.upserted ?? []
      const deletes = detail.deletedIds ?? []
      // Only touch state when there's relevant work — the realtime patch
      // already covers off-window dates.
      if (!upserts.length && !deletes.length) return
      setEntries(prev => {
        let next = prev
        if (deletes.length) {
          const drop = new Set(deletes)
          next = next.filter(e => !drop.has(e.id))
        }
        if (upserts.length) {
          const window = new Set(dateStringsRef.current)
          const inWindow = upserts.filter(u => window.has(u.date))
          if (inWindow.length) {
            // Filter by both id (in case the row was already in state from an
            // earlier realtime patch) AND (member_id, date) (so synthesized
            // optimistic rows from team-grid drag — id like "optimistic-…" —
            // get replaced by the canonical server rows).
            const ids = new Set(inWindow.map(u => u.id))
            const cells = new Set(inWindow.map(u => `${u.member_id}|${u.date}`))
            next = next
              .filter(e => !ids.has(e.id) && !cells.has(`${e.member_id}|${e.date}`))
              .concat(inWindow)
          }
        }
        return next === prev ? prev : next
      })
    }
    window.addEventListener('teampulse:entries-changed', handler)
    return () => window.removeEventListener('teampulse:entries-changed', handler)
  }, [fetchEntries])

  // Subscribe to Realtime changes for the scoped org(s) — one channel
  // per org so a multi-workspace combined view receives updates from
  // every side. Skipped while the tab is hidden so we don't burn a
  // websocket + decode JSON on every entry update for a screen no one
  // is looking at. When the tab becomes visible again the effect
  // re-runs (subscribe + fetch catch-up).
  useEffect(() => {
    if (!visible) {
      wasHiddenRef.current = true
      return
    }
    const supabase = createClient()
    const upsertHandler = (payload: { new: unknown }) => {
      const upserted = payload.new as Entry
      if (!upserted?.date || !dateStringsRef.current.includes(upserted.date)) return
      setEntries(prev => {
        const without = prev.filter(e => e.id !== upserted.id)
        return [...without, upserted]
      })
    }
    const channels = orgIds.map((id) =>
      supabase
        .channel(`entries:org:${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'entries', filter: `org_id=eq.${id}` }, upsertHandler)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'entries', filter: `org_id=eq.${id}` }, upsertHandler)
        .subscribe(),
    )
    // DELETE må stå på en EGEN, ufiltrert kanal — samme grep som
    // use-events/use-team-members. Med REPLICA IDENTITY DEFAULT inneholder
    // «old»-raden kun primærnøkkelen, så et server-side `org_id=eq.X`-filter
    // matcher aldri og hendelsen droppes i stillhet. Resultatet var en kiosk
    // som ble stående med en slettet ferie i dagevis (fanen er alltid synlig,
    // så visibility-catch-up-en fyrte aldri, og date-vinduet endrer seg først
    // ved ukeskifte). Vi abonnerer globalt og lar id-treff mot lokal state
    // være filteret — vi holder bare vårt eget scope sine id-er, og fremmede
    // slettinger blir en no-op som ikke engang trigger en re-render.
    const deleteChannel = supabase
      .channel(`entries:deletes:${orgIdsKey}`)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'entries' }, (payload) => {
        const deletedId = (payload.old as Partial<Entry>)?.id
        if (!deletedId) return
        setEntries(prev =>
          prev.some(e => e.id === deletedId) ? prev.filter(e => e.id !== deletedId) : prev,
        )
      })
      .subscribe()
    // Fire a one-shot catch-up only when resuming from a hidden state;
    // the initial-mount fetch is handled by the fetch effect above.
    if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      fetchEntries()
    }

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
      supabase.removeChannel(deleteChannel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey, visible, fetchEntries])

  // Stille reconciliation for alltid-på-flater. En kiosk står med samme
  // uke i dagevis: fanen er alltid synlig, så visibility-catch-up-en fyrer
  // aldri, og date-vinduet er uendret til uken ruller. Faller websocket-en
  // ut uten at klienten merker det (wifi-glitch, proxy som dreper idle
  // sockets), er det ingenting som henter sannheten tilbake. Et refetch
  // hvert 5. minutt lukker det gapet; `sameRows` gjør runden gratis når
  // ingenting er endret.
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => { fetchEntries() }, RECONCILE_MS)
    return () => clearInterval(id)
  }, [visible, fetchEntries])

  /**
   * Apply an in-memory update to the entries list without touching the DB.
   * Use this to reflect a mutation in the UI instantly, then fire the DB
   * write + refetch() to reconcile. On write failure, call refetch() to
   * restore truth from the server.
   */
  const applyOptimistic = useCallback((updater: (prev: Entry[]) => Entry[]) => {
    setEntries(updater)
  }, [])

  // Stable return object shape so consumers can destructure without refs
  return useMemo(
    () => ({ entries, loading, refetch: fetchEntries, applyOptimistic }),
    [entries, loading, fetchEntries, applyOptimistic],
  )
}
