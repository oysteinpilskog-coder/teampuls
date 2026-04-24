import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseTeamUpdate } from '@/lib/ai/parse-update'
import { applyUpdates } from '@/lib/ai/apply-updates'

// CloudMailin sends the parsed email as JSON.
// Ref: https://docs.cloudmailin.com/http_post_formats/json_normalized/
interface CloudMailinPayload {
  envelope: {
    to: string
    from: string
    recipients?: string[]
  }
  headers: {
    subject?: string
    from?: string
    to?: string
    [key: string]: string | undefined
  }
  plain?: string
  html?: string
}

export async function POST(req: NextRequest) {
  // ── 1. Verify webhook token ────────────────────────────────────────────────
  const token = req.nextUrl.searchParams.get('token')
  const expectedToken = process.env.CLOUDMAILIN_WEBHOOK_SECRET
  if (!expectedToken || token !== expectedToken) {
    console.warn('[email-inbound] Invalid or missing webhook token')
    // Return 200 so CloudMailin doesn't keep retrying
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 200 })
  }

  // ── 2. Parse CloudMailin payload ──────────────────────────────────────────
  let payload: CloudMailinPayload
  try {
    payload = await req.json() as CloudMailinPayload
  } catch {
    console.error('[email-inbound] Failed to parse JSON body')
    return NextResponse.json({ ok: false, reason: 'bad_payload' }, { status: 200 })
  }

  const senderEmail = payload.envelope?.from?.toLowerCase().trim()
  const toAddress   = payload.envelope?.to?.toLowerCase().trim()

  if (!senderEmail || !toAddress) {
    console.warn('[email-inbound] Missing envelope fields', { senderEmail, toAddress })
    return NextResponse.json({ ok: false, reason: 'missing_envelope' }, { status: 200 })
  }

  // Prefer plain text body; fall back to subject line; ignore HTML-only emails
  const subject = payload.headers?.subject?.trim() ?? ''
  const body    = payload.plain?.trim() ?? ''
  const text    = body || subject

  if (!text) {
    console.warn('[email-inbound] Empty message from', senderEmail)
    return NextResponse.json({ ok: false, reason: 'empty_message' }, { status: 200 })
  }

  // ── 3. Resolve org via inbound_email ──────────────────────────────────────
  const supabase = createAdminClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, timezone, inbound_email')
    .eq('inbound_email', toAddress)
    .maybeSingle()

  if (!org) {
    // Try prefix match: "calwin-abc123@inbound.teampulse.app" vs stored prefix
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, timezone, inbound_email')
    const matched = orgs?.find(o =>
      o.inbound_email && toAddress.startsWith(o.inbound_email.split('@')[0])
    )
    if (!matched) {
      console.warn('[email-inbound] No org found for inbound address', toAddress)
      return NextResponse.json({ ok: false, reason: 'unknown_org' }, { status: 200 })
    }
    Object.assign(org ?? {}, matched)
  }

  // ── 4. Resolve sender member ──────────────────────────────────────────────
  const { data: sender } = await supabase
    .from('members')
    .select('id, org_id, email, display_name')
    .eq('org_id', (org as { id: string }).id)
    .eq('email', senderEmail)
    .eq('is_active', true)
    .maybeSingle()

  if (!sender) {
    console.warn('[email-inbound] Unknown sender', senderEmail, 'for org', (org as { id: string }).id)
    return NextResponse.json({ ok: false, reason: 'unknown_sender' }, { status: 200 })
  }

  // ── 5. Fetch AI context: members, customers, offices, corrections ────────
  const [
    { data: allMembers },
    { data: allCustomers },
    { data: allOffices },
    { data: recentCorrections },
  ] = await Promise.all([
    supabase
      .from('members')
      .select('id, org_id, user_id, display_name, full_name, initials, email, avatar_url, nicknames, home_office_id, role, is_active, created_at, updated_at')
      .eq('org_id', sender.org_id)
      .eq('is_active', true),
    supabase
      .from('customers')
      .select('*')
      .eq('org_id', sender.org_id),
    supabase
      .from('offices')
      .select('*')
      .eq('org_id', sender.org_id),
    supabase
      .from('ai_corrections')
      .select('input_text, ai_status, ai_location, corrected_status, corrected_location')
      .eq('org_id', sender.org_id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!allMembers?.length) {
    return NextResponse.json({ ok: false, reason: 'no_members' }, { status: 200 })
  }

  // ── 6. Parse with Claude ──────────────────────────────────────────────────
  let result
  try {
    result = await parseTeamUpdate({
      text,
      senderEmail: sender.email,
      members: allMembers,
      customers: allCustomers ?? [],
      offices: allOffices ?? [],
      corrections: recentCorrections ?? [],
      today: new Date(),
      timezone: (org as { timezone: string }).timezone ?? 'Europe/Oslo',
    })
  } catch (err) {
    console.error('[email-inbound] Claude parse error:', err)
    await supabase.from('ai_messages').insert({
      org_id: sender.org_id,
      sender_member_id: sender.id,
      source: 'email',
      input_text: text,
      ai_response: null,
      entries_created: 0,
      error: String(err),
    }).then(() => {})
    return NextResponse.json({ ok: false, reason: 'parse_error' }, { status: 200 })
  }

  // Match the web threshold — see CLARIFICATION_CEILING in /api/ai/parse.
  // Medium-confidence parses get written with a "?" marker so the recipient
  // can see and correct them, rather than silently dropped.
  const CLARIFICATION_CEILING = 0.45
  const shouldWrite = result.confidence >= CLARIFICATION_CEILING && result.updates.length > 0

  // ── 7. Log request ────────────────────────────────────────────────────────
  supabase.from('ai_messages').insert({
    org_id: sender.org_id,
    sender_member_id: sender.id,
    source: 'email',
    input_text: text,
    ai_response: result,
    entries_created: shouldWrite ? result.updates.length : 0,
    confidence: result.confidence,
  }).then(() => {})

  // ── 8. Apply updates ──────────────────────────────────────────────────────
  if (shouldWrite) {
    await applyUpdates(supabase, sender.org_id, result, {
      sourceText: text,
      source: 'ai_email',
    })
    console.log('[email-inbound] Applied', result.updates.length, 'update(s) for', senderEmail)
  } else if (result.clarification) {
    console.log('[email-inbound] Clarification needed:', result.clarification)
  }

  return NextResponse.json({ ok: true })
}
