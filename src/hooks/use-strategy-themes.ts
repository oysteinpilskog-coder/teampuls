'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StrategyTheme } from '@/lib/supabase/types'
import { useDocumentVisibility } from '@/hooks/use-document-visibility'

/**
 * Fetches strategy themes for the given org and year, and subscribes to
 * Supabase Realtime so the wheel stays live across browsers.
 *
 * Backed by `strategy_themes` (UNIQUE on org_id, year, quarter) — there
 * are at most four rows per year. Missing quarters are filled in by the
 * caller with the empty-theme placeholder.
 */
export function useStrategyThemes(
  orgId: string,
  year: number,
  opts: { initial?: StrategyTheme[]; initialYear?: number } = {},
) {
  const seedMatches = opts.initial !== undefined && opts.initialYear === year
  const [themes, setThemes] = useState<StrategyTheme[]>(seedMatches ? opts.initial! : [])
  const [loading, setLoading] = useState(!seedMatches)
  const visible = useDocumentVisibility()
  const wasHiddenRef = useRef(false)
  const seededYearRef = useRef(seedMatches ? year : null)

  const fetchThemes = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('strategy_themes')
      .select('*')
      .eq('org_id', orgId)
      .eq('year', year)
      .order('quarter')
    setThemes((data as StrategyTheme[] | null) ?? [])
    setLoading(false)
  }, [orgId, year])

  useEffect(() => {
    if (seededYearRef.current === year) {
      seededYearRef.current = null
      setLoading(false)
      return
    }
    setLoading(true)
    fetchThemes()
  }, [fetchThemes, year])

  useEffect(() => {
    if (!visible) {
      wasHiddenRef.current = true
      return
    }
    const supabase = createClient()

    function upsertHandler(payload: { new: StrategyTheme }) {
      const upserted = payload.new
      if (upserted.org_id !== orgId || upserted.year !== year) return
      setThemes(prev => {
        const without = prev.filter(t => t.id !== upserted.id)
        const next = [...without, upserted]
        next.sort((a, b) => a.quarter - b.quarter)
        return next
      })
    }

    const channel = supabase
      .channel(`strategy_themes:org:${orgId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'strategy_themes', filter: `org_id=eq.${orgId}` },
        upsertHandler)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'strategy_themes', filter: `org_id=eq.${orgId}` },
        upsertHandler)
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'strategy_themes' },
        (payload) => {
          const deletedId = (payload.old as Partial<StrategyTheme>)?.id
          if (!deletedId) return
          setThemes(prev => prev.filter(t => t.id !== deletedId))
        })
      .subscribe()

    if (wasHiddenRef.current) {
      wasHiddenRef.current = false
      fetchThemes()
    }

    return () => { supabase.removeChannel(channel) }
  }, [orgId, year, visible, fetchThemes])

  return { themes, loading, refetch: fetchThemes }
}
