import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { HexColors } from './defaults'

/**
 * Fetch the current user's org status_colors override for SSR.
 * Returns null if not logged in, no member record, or no override set.
 * Cached per request via React.cache.
 */
export const getOrgStatusColors = cache(async (): Promise<Partial<HexColors> | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!member) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('status_colors')
    .eq('id', member.org_id)
    .maybeSingle()

  return (org?.status_colors as Partial<HexColors> | null) ?? null
})
