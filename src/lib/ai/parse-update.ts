import Anthropic from '@anthropic-ai/sdk'
import { buildStableSystemPrompt, buildDynamicSystemPrompt, buildUserPrompt } from './prompts'
import type { Member } from '@/lib/supabase/types'

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
  today: Date
  timezone: string
}): Promise<ParseResult> {
  const { text, senderEmail, members, today, timezone } = params

  const sender = members.find(m => m.email === senderEmail)
  if (!sender) {
    throw new Error(`Unknown sender: ${senderEmail}`)
  }

  const stablePrompt = buildStableSystemPrompt(members)
  const dynamicPrompt = buildDynamicSystemPrompt({
    today,
    senderName: sender.display_name,
    senderEmail: sender.email,
    timezone,
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    temperature: 0.2,
    system: [
      // Stable part: member list + rules — cached across requests for the same org
      {
        type: 'text',
        text: stablePrompt,
        cache_control: { type: 'ephemeral' },
      },
      // Dynamic part: today's date, sender — changes per request, not cached
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

  // Strip accidental markdown code fences
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
