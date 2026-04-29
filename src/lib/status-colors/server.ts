import { cache } from 'react'
import { getSessionMember } from '@/lib/supabase/session'
import type { StatusColorsPayload } from './defaults'

/**
 * Resolve the active workspace's `status_colors` JSONB for SSR.
 *
 * Reads directly from the workspace row that `getSessionMember()` already
 * fetched as part of the members+organizations join — no extra Supabase
 * round trip. The combined «Alle CalWin» surface deliberately falls back
 * to the default palette so it doesn't favour one workspace's overrides
 * over the other.
 */
export const getOrgStatusColors = cache(async (): Promise<StatusColorsPayload | null> => {
  const { activeWorkspace, combinedScope } = await getSessionMember()
  if (!activeWorkspace) return null
  if (combinedScope) return null
  return (activeWorkspace.status_colors as StatusColorsPayload | null) ?? null
})
