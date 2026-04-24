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
  const { activeWorkspace } = await getSessionMember()
  if (!activeWorkspace) return null

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('status_colors')
    .eq('id', activeWorkspace.org_id)
    .maybeSingle()

  return (org?.status_colors as StatusColorsPayload | null) ?? null
})
