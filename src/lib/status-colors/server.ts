import { cache } from 'react'
import { getSessionMember } from '@/lib/supabase/session'
import { createClient } from '@/lib/supabase/server'
import type { HexColors } from './defaults'

/**
 * Fetch the active workspace's status_colors override for SSR.
 * Returns null if not logged in, no workspace, or no override set.
 * Cached per request via React.cache.
 */
export const getOrgStatusColors = cache(async (): Promise<Partial<HexColors> | null> => {
  const { activeWorkspace } = await getSessionMember()
  if (!activeWorkspace) return null

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('status_colors')
    .eq('id', activeWorkspace.org_id)
    .maybeSingle()

  return (org?.status_colors as Partial<HexColors> | null) ?? null
})
