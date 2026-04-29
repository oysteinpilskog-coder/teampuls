import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Soft per-member rate limit on Claude-API-backed endpoints. The goal is
 * cost containment — stop a runaway loop or buggy frontend, not block
 * legitimate human use. Humans type at <1 req/sec; 30 req/min is generous.
 *
 * Counts rows in `ai_messages` for the caller's member_id within the
 * sliding window. Cheap query (indexed on org_id+created_at), and doesn't
 * need a new table or external rate-limit infra.
 *
 * The check happens BEFORE calling Claude. If the route fails after the
 * check (Claude error, parse error), no row gets logged — that's fine,
 * means a failed request doesn't count toward the user's quota. Conversely
 * a successful request always logs, so the limit is correctly enforced.
 */

const WINDOW_SECONDS = 60
const MAX_PER_WINDOW = 30

export interface RateLimitOk {
  ok: true
  remaining: number
}

export interface RateLimitDenied {
  ok: false
  retryAfter: number
  used: number
  limit: number
}

export async function checkAiRateLimit(
  admin: SupabaseClient,
  memberId: string,
): Promise<RateLimitOk | RateLimitDenied> {
  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()

  const { count, error } = await admin
    .from('ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_member_id', memberId)
    .gte('created_at', since)

  // If the count query fails, fail open — don't lock users out due to a
  // transient DB issue. Vercel logs surface the error for diagnosis.
  if (error) {
    console.warn('[ratelimit] count query failed, failing open:', error.message)
    return { ok: true, remaining: MAX_PER_WINDOW }
  }

  const used = count ?? 0
  if (used >= MAX_PER_WINDOW) {
    return {
      ok: false,
      retryAfter: WINDOW_SECONDS,
      used,
      limit: MAX_PER_WINDOW,
    }
  }

  return { ok: true, remaining: MAX_PER_WINDOW - used }
}
