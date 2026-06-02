import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveMember } from '@/lib/supabase/session'
import { parseTeamUpdate } from '@/lib/ai/parse-update'
import { applyUpdates } from '@/lib/ai/apply-updates'
import { getServerDict } from '@/lib/i18n/server'
import { checkAiRateLimit } from '@/lib/ratelimit'

// Node runtime — this route resolves the caller's member via the
// service-role client (resolveActiveMember). On Vercel's Edge runtime that
// client did not get SUPABASE_SERVICE_ROLE_KEY reliably, so the lookup
// returned null and every status write failed with "user not linked".
// Node matches getSessionMember (RSC), where the same admin lookup works.
export const runtime = 'nodejs'

/**
 * Confidence threshold below which we bail to a clarification question
 * rather than writing anything. Kept low on purpose — we prefer a written
 * entry with a "?" marker over a blank cell, because a visible AI guess
 * gives the user something to correct (and teaches the corrections loop).
 */
const CLARIFICATION_CEILING = 0.45

export async function POST(req: NextRequest) {
  const dict = await getServerDict()
  try {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: dict.aiInput.sessionExpired }, { status: 401 })
    }

    const admin = createAdminClient()
    const member = await resolveActiveMember(admin, user.id, user.email)

    if (!member) {
      return NextResponse.json(
        { error: dict.aiInput.notLinked },
        { status: 403 }
      )
    }

    const limit = await checkAiRateLimit(admin, member.id)
    if (!limit.ok) {
      return NextResponse.json(
        { error: dict.aiInput.rateLimited },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      )
    }

    const { text } = await req.json() as { text: string }
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // Combined «Alle CalWin»-mode spans multiple workspaces under the same
    // account. We fan IN-queries across all involved orgs so the parser sees
    // the full roster, then route writes back to each member's actual org.
    const scopedOrgIds = member.combined_org_ids ?? [member.org_id]

    // Fetch AI context in parallel: members, customers, offices, org timezone,
    // and the 20 most recent corrections so the parser can few-shot from them.
    const [
      { data: allMembers },
      { data: allCustomers },
      { data: allOffices },
      { data: org },
      { data: recentCorrections },
    ] = await Promise.all([
      admin
        .from('members')
        .select('id, org_id, user_id, display_name, full_name, initials, email, avatar_url, nicknames, home_office_id, role, is_active, created_at, updated_at')
        .in('org_id', scopedOrgIds)
        .eq('is_active', true),
      admin
        .from('customers')
        .select('*')
        .in('org_id', scopedOrgIds),
      admin
        .from('offices')
        .select('*')
        .in('org_id', scopedOrgIds),
      admin
        .from('organizations')
        .select('timezone')
        .eq('id', member.org_id)
        .maybeSingle(),
      admin
        .from('ai_corrections')
        .select('input_text, ai_status, ai_location, corrected_status, corrected_location')
        .in('org_id', scopedOrgIds)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (!allMembers?.length) {
      return NextResponse.json(
        { error: dict.aiInput.noActiveMembers },
        { status: 500 }
      )
    }

    const timezone = org?.timezone ?? 'Europe/Oslo'
    const isAdmin = member.role === 'admin'

    const result = await parseTeamUpdate({
      text: text.trim(),
      senderEmail: member.email,
      members: allMembers,
      customers: allCustomers ?? [],
      offices: allOffices ?? [],
      corrections: recentCorrections ?? [],
      today: new Date(),
      timezone,
    })

    // Non-admins can only write entries for themselves. The parser prompt
    // tells the model to refuse cross-member updates, but we re-check
    // server-side as the source of truth — the model is a soft signal,
    // never the gate. Mirrors the entries-RLS rule for the admin client.
    if (!isAdmin) {
      const ownMemberId = member.id
      const allTargetsAreSelf =
        result.updates.every((u) => u.member_id === ownMemberId) &&
        (result.visit?.host_member_id ?? ownMemberId) === ownMemberId &&
        (result.original_period?.member_id ?? ownMemberId) === ownMemberId
      if (!allTargetsAreSelf) {
        admin
          .from('ai_messages')
          .insert({
            org_id: member.org_id,
            sender_member_id: member.id,
            source: 'web',
            input_text: text.trim(),
            ai_response: result,
            entries_created: 0,
            confidence: result.confidence,
            error: 'rejected: non-admin cross-member write',
          })
          .then(() => {})
        return NextResponse.json({
          success: false,
          code: 'forbidden',
          clarification: dict.aiInput.adminOnlyOtherMember,
          updates: [],
        })
      }
    }

    // Log request (best-effort)
    admin
      .from('ai_messages')
      .insert({
        org_id: member.org_id,
        sender_member_id: member.id,
        source: 'web',
        input_text: text.trim(),
        ai_response: result,
        entries_created: result.confidence >= CLARIFICATION_CEILING ? result.updates.length : 0,
        confidence: result.confidence,
      })
      .then(() => {})

    // Really-uncertain → clarification only, no write. Et besøk uten
    // tilhørende updates teller også som «noe å skrive» — uten dette
    // ville velkomst-only-meldinger («Anna kommer 14:00») falle igjennom.
    const hasSomethingToWrite = result.updates.length > 0 || result.visit != null
    if (result.confidence < CLARIFICATION_CEILING || !hasSomethingToWrite) {
      return NextResponse.json({
        success: false,
        clarification: result.clarification ?? dict.aiInput.clarificationFallback,
        updates: [],
      })
    }

    // Everything else — including medium-confidence parses — gets written.
    // The UI renders a "?" marker for confidence < 0.7 so the user can tell
    // which cells to sanity-check.
    //
    // In combined mode, build a member→org map so entries/visits land in
    // each member's actual workspace, not the caller's fallback org.
    const memberOrgIds = member.combined_org_ids
      ? new Map(allMembers.map((m) => [m.id, m.org_id]))
      : undefined

    const writeResult = await applyUpdates(admin, member.org_id, result, {
      sourceText: text.trim(),
      source: 'ai_web',
      memberOrgIds,
    })

    return NextResponse.json({
      success: true,
      updates: result.updates,
      action: result.action,
      confidence: result.confidence,
      clarification: result.clarification,
      // Echo what we actually persisted so the client can paint optimistically
      // in the same frame the response arrives — no realtime round-trip,
      // no `select('*')` refetch.
      writes: {
        upsertedEntries: writeResult.upsertedEntries,
        deletedEntryIds: writeResult.deletedEntryIds,
        insertedVisit: writeResult.insertedVisit,
      },
    })
  } catch (err) {
    console.error('[ai/parse] Error:', err)
    return NextResponse.json(
      { error: dict.common.error },
      { status: 500 }
    )
  }
}
