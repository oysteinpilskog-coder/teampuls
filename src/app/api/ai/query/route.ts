import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveMember } from '@/lib/supabase/session'
import { parseTeamQuery } from '@/lib/ai/query'
import { getServerDict } from '@/lib/i18n/server'

/**
 * POST /api/ai/query { question: string }
 *
 * Turns a natural-language question into a filter, runs it against the
 * caller's org, and returns a short human answer plus the matching
 * (member_id, date) pairs so the client can highlight those cells.
 */
export async function POST(req: NextRequest) {
  const dict = await getServerDict()
  try {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const member = await resolveActiveMember(admin, user.id, user.email)
    if (!member) {
      return NextResponse.json({ error: dict.ai.notLinkedToOrg }, { status: 403 })
    }

    const { question } = (await req.json()) as { question?: string }
    if (!question?.trim()) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 })
    }

    const [{ data: members }, { data: org }] = await Promise.all([
      admin
        .from('members')
        .select('id, org_id, user_id, display_name, full_name, initials, email, avatar_url, nicknames, home_office_id, default_status, role, is_active, created_at, updated_at')
        .eq('org_id', member.org_id)
        .eq('is_active', true),
      admin
        .from('organizations')
        .select('timezone')
        .eq('id', member.org_id)
        .maybeSingle(),
    ])
    if (!members?.length) {
      return NextResponse.json({
        answer: 'Fant ingen medlemmer.',
        matches: [],
        confidence: 0,
      })
    }

    const result = await parseTeamQuery({
      question: question.trim(),
      members,
      today: new Date(),
      timezone: org?.timezone ?? 'Europe/Oslo',
    })

    // Low confidence → ask for clarification instead of guessing.
    if (result.confidence < 0.4 || result.clarification) {
      return NextResponse.json({
        answer: null,
        clarification: result.clarification ?? 'Jeg forstod ikke helt — kan du formulere annerledes?',
        matches: [],
        confidence: result.confidence,
        filters: result.filters,
      })
    }

    // Run the filters against the entries table. Keep it org-scoped and
    // bounded — if no dates were inferred, default to a wide 90-day window
    // around today so the query doesn't scan the entire table.
    const today = new Date()
    const defaultFrom = new Date(today); defaultFrom.setDate(defaultFrom.getDate() - 14)
    const defaultTo   = new Date(today); defaultTo.setDate(defaultTo.getDate() + 60)
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dateFrom = result.filters.date_from ?? iso(defaultFrom)
    const dateTo   = result.filters.date_to   ?? iso(defaultTo)

    let q = admin
      .from('entries')
      .select('id, org_id, member_id, date, status, location_label, note, source, source_text, created_by, created_at, updated_at')
      .eq('org_id', member.org_id)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date')

    if (result.filters.statuses) q = q.in('status', result.filters.statuses)
    if (result.filters.member_ids) q = q.in('member_id', result.filters.member_ids)
    // Location is a substring match — pushed down with multiple `ilike` ORs.
    if (result.filters.locations) {
      const ors = result.filters.locations
        .map((loc) => `location_label.ilike.%${escapeIlike(loc)}%`)
        .join(',')
      q = q.or(ors)
    }

    const { data: rows, error } = await q
    if (error) {
      console.error('[ai/query] Supabase error:', error)
      return NextResponse.json({ error: 'Kunne ikke kjøre spørringen' }, { status: 500 })
    }

    const byId = new Map(members.map((m) => [m.id, m]))
    // Dedup members for the "members" placeholder (one entry counted once).
    const uniqueMemberIds = new Set<string>()
    const matches = (rows ?? []).map((r) => {
      uniqueMemberIds.add(r.member_id as string)
      const m = byId.get(r.member_id as string)
      return {
        entry_id: r.id as string,
        member_id: r.member_id as string,
        member_name: (m?.full_name || m?.display_name) ?? 'Ukjent',
        member_avatar_url: m?.avatar_url ?? null,
        member_initials: m?.initials ?? null,
        date: r.date as string,
        status: r.status as string,
        location_label: (r.location_label as string | null) ?? null,
        note: (r.note as string | null) ?? null,
      }
    })

    // Compose the answer from the template the model returned.
    const names = Array.from(uniqueMemberIds)
      .map((id) => {
        const m = byId.get(id)
        return m ? (m.full_name || m.display_name) : null
      })
      .filter(Boolean) as string[]

    const count = uniqueMemberIds.size
    const membersJoined =
      names.length === 0
        ? 'ingen'
        : names.length === 1
          ? names[0]
          : names.length === 2
            ? `${names[0]} og ${names[1]}`
            : `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`

    const answer = result.answer_template
      .replace(/\{count\}/g, String(count))
      .replace(/\{members\}/g, membersJoined)

    return NextResponse.json({
      answer,
      matches,
      confidence: result.confidence,
      filters: result.filters,
      member_ids: Array.from(uniqueMemberIds),
    })
  } catch (err) {
    console.error('[ai/query] Error:', err)
    return NextResponse.json({ error: 'Noe gikk galt.' }, { status: 500 })
  }
}

function escapeIlike(s: string): string {
  return s.replace(/[%_,]/g, (c) => `\\${c}`)
}
