import { cache } from 'react'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import type { StatusColorsPayload } from './defaults'

/**
 * Fetch the active workspace's status_colors override for SSR.
 * Returns null if not logged in, no workspace, or no override set.
 * Cached per request via React.cache. The JSONB carries both the
 * per-status hex keys and the optional `*_aurora` map-pin overrides.
 */
export const getOrgStatusColors = cache(async (): Promise<StatusColorsPayload | null> => {
  const { activeWorkspace, combinedScope } = await getSessionMember()
  if (!activeWorkspace) return null

  // Combined "Alle CalWin" view: the synthetic workspace's org_id
  // (`__combined__`) doesn't exist in the DB. We could merge per-org
  // overrides but that gets messy when the two workspaces disagree —
  // falling back to the default palette keeps the combined surface
  // neutral and avoids favouring one company's branding.
  if (combinedScope) return null

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('status_colors')
    .eq('id', activeWorkspace.org_id)
    .maybeSingle()

  return (org?.status_colors as StatusColorsPayload | null) ?? null
})
