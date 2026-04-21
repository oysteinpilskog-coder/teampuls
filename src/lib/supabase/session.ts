import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Get the authenticated user + their member record for the current request.
 * Deduplicated with React.cache so repeated calls inside a single RSC render
 * (layout + page + components) only hit Supabase once.
 */
export const getSessionMember = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, member: null }

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, display_name, role, avatar_url')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  return { user, member }
})
