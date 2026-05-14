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
    setEntries(data ?? [])
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
    const channels = orgIds.map((id) =>
      supabase
        .channel(`entries:org:${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'entries',
            filter: `org_id=eq.${id}`,
          },
          (payload) => {
            // DELETE: payload.old may only contain the primary key when the
            // table uses the default REPLICA IDENTITY, so fall back to removing
            // by id alone and skip the date-window check.
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as Partial<Entry>
              if (!deleted.id) return
              setEntries(prev => prev.filter(e => e.id !== deleted.id))
              return
            }
            const upserted = payload.new as Entry
            if (!upserted?.date || !dateStringsRef.current.includes(upserted.date)) return
            setEntries(prev => {
              const without = prev.filter(e => e.id !== upserted.id)
              return [...without, upserted]
            })
          }
        )
        .subscribe(),
    )
    // Fire a one-shot catch-up only when resuming from a hidden state;
    // the initial-mount fetch is handled by the fetch effect above.
    if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      fetchEntries()
    }

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIdsKey, visible, fetchEntries])

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
