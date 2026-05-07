import { cache } from 'react'
import { getSessionMember } from '@/lib/supabase/session'
import type { StatusColorsPayload } from './defaults'

/**
 * Resolve the active workspace's `status_colors` JSONB for SSR.
 *
 * Reads directly from the workspace row that `getSessionMember()` already
 * fetched as part of the members+organizations join — no extra Supabase
 * round trip. In combined «Alle» view we fall back to the user's home
 * workspace palette (or the first workspace with overrides set) so a
 * yellow vacation tint stays yellow when the user pivots from one
 * workspace to «Alle» — instead of snapping back to the default rose.
 */
export const getOrgStatusColors = cache(async (): Promise<StatusColorsPayload | null> => {
  const { activeWorkspace, combinedScope, workspaces, member } = await getSessionMember()
  if (!activeWorkspace) return null
  if (combinedScope) {
    const home = member ? workspaces.find((w) => w.org_id === member.org_id) : null
    const homeColors = home?.status_colors as StatusColorsPayload | null | undefined
    if (homeColors) return homeColors
    const fallback = workspaces.find((w) => !!w.status_colors)
    return (fallback?.status_colors as StatusColorsPayload | null) ?? null
  }
  return (activeWorkspace.status_colors as StatusColorsPayload | null) ?? null
})
