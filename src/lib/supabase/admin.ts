import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client — bypasses RLS.
 * Use only in server-side webhook handlers where no user session exists.
 * Never expose to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
