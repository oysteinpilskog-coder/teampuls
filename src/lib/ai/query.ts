import Anthropic from '@anthropic-ai/sdk'
import type { Member, EntryStatus } from '@/lib/supabase/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface QueryFilters {
  /** Inclusive start date (YYYY-MM-DD). */
  date_from: string | null
  /** Inclusive end date (YYYY-MM-DD). */
  date_to: string | null
  /** One or more statuses to match. Null = any status. */
  statuses: EntryStatus[] | null
  /** Location substrings — a row matches if ANY substring is contained in location_label. Case-insensitive. */
  locations: string[] | null
  /** Member ids to restrict to. Null = any member. */
  member_ids: string[] | null
}

export interface QueryResult {
  filters: QueryFilters
  /** Short Norwegian summary template with `{count}` and `{members}` placeholders. */
  answer_template: string
  /** 0-1 confidence the AI understood the question. */
  confidence: number
  /** Non-null when the question is ambiguous and needs clarification. */
  clarification: string | null
}

const VALID_STATUSES: EntryStatus[] = [
  'office', 'remote', 'customer', 'travel', 'vacation', 'sick', 'off',
]

/**
 * Parse a free-form question about the team ("hvem er i Oslo neste uke?",
 * "er Johan hjemme fredag?", "hvor mange er på ferie i uke 25?") into a
 * structured filter. The model returns strict JSON — we parse and validate
 * defensively so a malformed response can't crash the endpoint.
 */
export async function parseTeamQuery(params: {
  question: string
  members: Member[]
  today: Date
  timezone: string
}): Promise<QueryResult> {
  const { question, members, today, timezone } = params

  const memberList = members
    .map((m) => `- ${m.display_name} (id: ${m.id})`)
    .join('\n')

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone,
  }).format(today) // 'YYYY-MM-DD' in org tz

  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', timeZone: timezone,
  }).format(today)

  const system = `You convert a natural-language question about a Norwegian team into a structured JSON filter. Reply with JSON only — no prose, no markdown.

Today: ${todayStr} (${weekday}), timezone ${timezone}.

Valid statuses:
  office    = at the office
  remote    = working from home ("hjemmekontor", "hjemme")
  customer  = at a customer site ("hos kunde")
  travel    = travelling ("reise", "på reise")
  vacation  = on holiday ("ferie")
  sick      = sick leave ("syk")
  off       = day off / personal leave ("fri")

Team members:
${memberList}

Output schema (every field required, use null when not applicable):
{
  "filters": {
    "date_from": "YYYY-MM-DD" | null,
    "date_to":   "YYYY-MM-DD" | null,
    "statuses":  ["office"|"remote"|...] | null,
    "locations": ["oslo", "vilnius"] | null,
    "member_ids": ["<uuid>"] | null
  },
  "answer_template": "<short Norwegian sentence with {count} and/or {members} placeholders>",
  "confidence": 0.0-1.0,
  "clarification": null | "<Norwegian clarifying question>"
}

Rules:
- "i dag" → date_from = date_to = today
- "i morgen" → date_from = date_to = today + 1 day
- "denne uken" → Monday–Friday of the current ISO week
- "neste uke" → Mon–Fri of next ISO week
- "uke N" → Mon–Fri of ISO week N in the current year
- "i Oslo" / "på Vilnius" → locations=["oslo"] (lowercased, substring)
- Name mentions ("Johan", "Øystein") → resolve to member_ids via the list above
- When the user's question is a count ("hvor mange er på kontoret"), use {count}.
  When it's a list ("hvem er i Oslo"), use {members}.
  When both apply, put them both in the template.
- answer_template must make grammatical sense even if count=0 (prefer "Ingen er ..." instead of "0 ...")
- If the question is ambiguous, set clarification (Norwegian) and confidence < 0.5
- Low confidence never invents dates — leave fields null if unsure`

  const userMsg = `Question: ${question}

Return JSON only.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    temperature: 0.1,
    system,
    messages: [{ role: 'user', content: userMsg }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  const raw = textBlock && 'text' in textBlock ? textBlock.text : ''
  const parsed = extractJson(raw)

  return validateQueryResult(parsed, members)
}

function extractJson(raw: string): unknown {
  // Tolerate ```json fences just in case.
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function validateQueryResult(x: unknown, members: Member[]): QueryResult {
  const fallback: QueryResult = {
    filters: { date_from: null, date_to: null, statuses: null, locations: null, member_ids: null },
    answer_template: 'Jeg fant ikke noe å svare med.',
    confidence: 0,
    clarification: 'Kan du formulere spørsmålet annerledes?',
  }
  if (!x || typeof x !== 'object') return fallback
  const obj = x as Record<string, unknown>
  const f = (obj.filters ?? {}) as Record<string, unknown>

  const iso = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

  const validStatus = (v: unknown): EntryStatus | null =>
    typeof v === 'string' && (VALID_STATUSES as string[]).includes(v) ? (v as EntryStatus) : null

  const memberIdSet = new Set(members.map((m) => m.id))
  const validMemberId = (v: unknown): string | null =>
    typeof v === 'string' && memberIdSet.has(v) ? v : null

  const statuses = Array.isArray(f.statuses)
    ? f.statuses.map(validStatus).filter((s): s is EntryStatus => s !== null)
    : null
  const locations = Array.isArray(f.locations)
    ? f.locations.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        .map((l) => l.toLowerCase())
    : null
  const member_ids = Array.isArray(f.member_ids)
    ? f.member_ids.map(validMemberId).filter((i): i is string => i !== null)
    : null

  return {
    filters: {
      date_from: iso(f.date_from),
      date_to: iso(f.date_to),
      statuses: statuses && statuses.length ? statuses : null,
      locations: locations && locations.length ? locations : null,
      member_ids: member_ids && member_ids.length ? member_ids : null,
    },
    answer_template: typeof obj.answer_template === 'string' ? obj.answer_template : fallback.answer_template,
    confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0,
    clarification: typeof obj.clarification === 'string' && obj.clarification.trim() ? obj.clarification : null,
  }
}
