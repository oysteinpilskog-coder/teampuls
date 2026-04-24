import Anthropic from '@anthropic-ai/sdk'
import {
  buildStableSystemPrompt,
  buildDynamicSystemPrompt,
  buildUserPrompt,
  type CorrectionExample,
} from './prompts'
import type { Member, Customer, Office } from '@/lib/supabase/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface ParsedUpdate {
  member_id: string
  member_name: string
  dates: string[]
  status: string | null
  location: string | null
  note: string | null
}

export interface ParseResult {
  updates: ParsedUpdate[]
  action: 'create' | 'update' | 'delete'
  confidence: number
  clarification: string | null
  original_period?: {
    member_id: string
    dates: string[]
  }
}

export async function parseTeamUpdate(params: {
  text: string
  senderEmail: string
  members: Member[]
  customers?: Customer[]
  offices?: Office[]
  corrections?: CorrectionExample[]
  today: Date
  timezone: string
}): Promise<ParseResult> {
  const {
    text,
    senderEmail,
    members,
    customers = [],
    offices = [],
    corrections = [],
    today,
    timezone,
  } = params

  const sender = members.find(m => m.email === senderEmail)
  if (!sender) {
    throw new Error(`Unknown sender: ${senderEmail}`)
  }
  const senderHomeOffice = sender.home_office_id
    ? offices.find(o => o.id === sender.home_office_id)
    : null

  const stablePrompt = buildStableSystemPrompt(members, customers, offices, corrections)
  const dynamicPrompt = buildDynamicSystemPrompt({
    today,
    senderName: sender.display_name,
    senderEmail: sender.email,
    senderHomeOfficeCity: senderHomeOffice?.city ?? null,
    timezone,
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0.2,
    system: [
      // Stable: roster + rules + corrections — cached across requests per org.
      // Corrections grow slowly, so cache-busting on new-correction is fine.
      {
        type: 'text',
        text: stablePrompt,
        cache_control: { type: 'ephemeral' },
      },
      // Dynamic: today, sender — changes every request, not cached.
      {
        type: 'text',
        text: dynamicPrompt,
      },
    ],
    messages: [
      { role: 'user', content: buildUserPrompt(text) },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response')
  }

  const jsonText = textBlock.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  try {
    return JSON.parse(jsonText) as ParseResult
  } catch {
    throw new Error(`Invalid JSON from Claude: ${jsonText.slice(0, 200)}`)
  }
}
