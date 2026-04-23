'use client'

import { Dialog } from '@base-ui/react/dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, ArrowRight, Send } from 'lucide-react'
import { spring } from '@/lib/motion'
import { useHaptic } from '@/hooks/use-haptic'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusIcon } from '@/components/icons/status-icons'
import { useStatusColors } from '@/lib/status-colors/context'
import type { EntryStatus } from '@/lib/supabase/types'

interface Match {
  entry_id: string
  member_id: string
  member_name: string
  member_avatar_url: string | null
  member_initials: string | null
  date: string
  status: string
  location_label: string | null
  note: string | null
}

interface QueryResponse {
  answer: string | null
  clarification?: string
  matches: Match[]
  member_ids?: string[]
  confidence: number
  error?: string
}

const EXAMPLE_QUESTIONS = [
  'Hvem er i Oslo neste uke?',
  'Hvor mange er på kontoret i dag?',
  'Hvem har ferie i uke 25?',
  'Er Johan syk denne uken?',
  'Hvem er på reise i morgen?',
]

/**
 * Fires from anywhere to open the AI query modal. The palette uses this.
 */
export function openAIQuery() {
  window.dispatchEvent(new CustomEvent('teampulse:ai-query:open'))
}

export function AIQueryModal() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<QueryResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const haptic = useHaptic()
  const colors = useStatusColors()

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('teampulse:ai-query:open', onOpen)
    return () => window.removeEventListener('teampulse:ai-query:open', onOpen)
  }, [])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setQuestion('')
      setResponse(null)
      setLoading(false)
    }
  }, [open])

  const submit = useCallback(async () => {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = (await res.json()) as QueryResponse
      setResponse(data)
      if (data.answer && data.matches.length > 0) haptic('success')
      else if (data.clarification) haptic('warning')
    } catch {
      setResponse({
        answer: null,
        matches: [],
        confidence: 0,
        error: 'Kunne ikke kjøre spørringen.',
      })
      haptic('error')
    } finally {
      setLoading(false)
    }
  }, [question, loading, haptic])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function highlightInGrid() {
    if (!response?.matches.length) return
    const cells = response.matches.map((m) => ({ memberId: m.member_id, date: m.date }))
    window.dispatchEvent(new CustomEvent('teampulse:ai-query:highlight', { detail: { cells } }))
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[100]"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-primary) 55%, rgba(5,8,18,0.55))',
                    backdropFilter: 'blur(18px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                  }}
                />
              }
            />
            <Dialog.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={spring.snappy}
                  className="fixed left-1/2 top-[12vh] -translate-x-1/2 z-[101] w-[min(94vw,680px)] rounded-2xl overflow-hidden outline-none"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                    border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                    boxShadow:
                      '0 50px 100px -24px rgba(10,20,40,0.42), 0 24px 48px -20px rgba(10,20,40,0.25), inset 0 1px 0 rgba(255,255,255,0.55)',
                  }}
                />
              }
            >
              <Dialog.Title className="sr-only">Still et spørsmål til teamet</Dialog.Title>

              {/* Input row */}
              <div
                className="flex items-center gap-3 px-5 h-14"
                style={{
                  borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
                }}
              >
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-color)' }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Still et spørsmål om teamet…"
                  className="flex-1 bg-transparent outline-none"
                  style={{
                    fontSize: 16,
                    fontFamily: 'var(--font-body)',
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.005em',
                    caretColor: 'var(--accent-color)',
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!question.trim() || loading}
                  aria-label="Send"
                  className="flex items-center justify-center w-9 h-9 rounded-xl transition-transform disabled:opacity-40 hover:scale-105 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))',
                    boxShadow: '0 4px 12px color-mix(in oklab, var(--accent-color) 35%, transparent)',
                  }}
                >
                  {loading ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'min(60vh, 540px)' }}>
                {!response && !loading && (
                  <Examples onPick={(q) => { setQuestion(q); requestAnimationFrame(submit) }} />
                )}

                {loading && <Shimmer />}

                {response && !loading && (
                  <Results response={response} colors={colors} onHighlight={highlightInGrid} />
                )}
              </div>

              {/* Footer hints */}
              <div
                className="flex items-center gap-3 px-5 h-10 text-[11px]"
                style={{
                  borderTop: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
                  background: 'color-mix(in oklab, var(--bg-subtle) 65%, transparent)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Kbd>↵</Kbd> Send
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>Esc</Kbd> Lukk
                </span>
                <span className="ml-auto flex items-center gap-1 opacity-75">
                  <Sparkles className="w-3 h-3" style={{ color: 'var(--accent-color)' }} />
                  AI-drevet
                </span>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Examples({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.22em] mb-3"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        Eksempler
      </div>
      <div className="flex flex-col gap-1">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="group flex items-center justify-between gap-2 px-3 h-10 rounded-xl text-left text-[14px] transition-colors focus:outline-none"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in oklab, var(--accent-color) 8%, transparent)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span>{q}</span>
            <ArrowRight
              className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity"
              style={{ color: 'var(--accent-color)' }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function Shimmer() {
  return (
    <div className="space-y-2.5">
      <span className="tp-shimmer block" style={{ height: 14, width: '60%', borderRadius: 4 }} />
      <span className="tp-shimmer block" style={{ height: 10, width: '40%', borderRadius: 3 }} />
      <div className="h-2" />
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className="tp-shimmer block"
          style={{ height: 42, borderRadius: 10, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  )
}

function Results({
  response,
  colors,
  onHighlight,
}: {
  response: QueryResponse
  colors: ReturnType<typeof useStatusColors>
  onHighlight: () => void
}) {
  if (response.error) {
    return (
      <div
        className="rounded-xl p-4 text-[14px]"
        style={{
          background: 'color-mix(in oklab, #EF4444 10%, transparent)',
          color: '#EF4444',
          fontFamily: 'var(--font-body)',
        }}
      >
        {response.error}
      </div>
    )
  }
  if (response.clarification) {
    return (
      <div
        className="rounded-xl p-4 text-[14px]"
        style={{
          background: 'color-mix(in oklab, var(--accent-color) 10%, transparent)',
          color: 'var(--text-primary)',
          border: '1px solid color-mix(in oklab, var(--accent-color) 22%, transparent)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1"
          style={{ color: 'var(--accent-color)' }}
        >
          Trenger avklaring
        </div>
        {response.clarification}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Answer banner */}
      <div
        className="rounded-xl p-4"
        style={{
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent-color) 14%, var(--bg-elevated)), var(--bg-elevated))',
          border: '1px solid color-mix(in oklab, var(--accent-color) 28%, transparent)',
          boxShadow: '0 10px 24px -12px color-mix(in oklab, var(--accent-color) 28%, transparent)',
        }}
      >
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1.5"
          style={{ color: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
        >
          Svar
        </div>
        <p
          className="font-semibold"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sora)',
            fontSize: 17,
            letterSpacing: '-0.02em',
            lineHeight: 1.35,
          }}
        >
          {response.answer ?? '—'}
        </p>
      </div>

      {/* Matches */}
      {response.matches.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              Treff · {response.matches.length}
            </div>
            <button
              type="button"
              onClick={onHighlight}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors focus:outline-none"
              style={{
                color: 'var(--accent-color)',
                background: 'color-mix(in oklab, var(--accent-color) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--accent-color) 22%, transparent)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Fremhev i rutenett
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1">
            {response.matches.slice(0, 20).map((m) => {
              const pal = colors[m.status as EntryStatus]
              return (
                <div
                  key={m.entry_id}
                  className="flex items-center gap-3 h-10 px-2 rounded-lg"
                  style={{
                    background: 'color-mix(in oklab, var(--bg-subtle) 55%, transparent)',
                  }}
                >
                  <MemberAvatar
                    name={m.member_name}
                    avatarUrl={m.member_avatar_url}
                    initials={m.member_initials ?? null}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[13px] font-semibold truncate"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                    >
                      {m.member_name}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                    >
                      {new Date(m.date).toLocaleDateString('nb-NO', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {m.location_label && ` · ${m.location_label}`}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-semibold shrink-0"
                    style={{
                      background: `color-mix(in oklab, ${pal.icon} 14%, transparent)`,
                      color: pal.icon,
                      border: `1px solid color-mix(in oklab, ${pal.icon} 28%, transparent)`,
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    <StatusIcon status={m.status as EntryStatus} size={10} color={pal.icon} />
                    {m.status}
                  </span>
                </div>
              )
            })}
            {response.matches.length > 20 && (
              <div
                className="text-[11px] text-center py-2"
                style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
              >
                +{response.matches.length - 20} til — bruk "Fremhev i rutenett" for å se alle
              </div>
            )}
          </div>
        </>
      )}

      {response.matches.length === 0 && response.answer && (
        <div
          className="rounded-xl px-4 py-3 text-[13px]"
          style={{
            background: 'color-mix(in oklab, var(--bg-subtle) 55%, transparent)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Ingen treff for dette spørsmålet.
        </div>
      )}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[10px] font-semibold"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 95%, transparent)',
        color: 'var(--text-secondary)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </kbd>
  )
}
