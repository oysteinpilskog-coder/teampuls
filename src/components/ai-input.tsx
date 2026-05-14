'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useDeferredValue,
  memo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/context'
import { spring, ease } from '@/lib/motion'
import { useHaptic } from '@/hooks/use-haptic'
// Plain box-shadow values — driven by a CSS transition instead of Framer
// Motion so re-renders during typing don't re-evaluate the spring.
const GLOW_FOCUS  = '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 24px var(--lg-accent-glow)'
const GLOW_OK     = '0 0 0 3px color-mix(in oklab, var(--success) 22%, transparent), 0 0 24px color-mix(in oklab, var(--success) 30%, transparent)'
const GLOW_NONE   = 'none'

const ROTATE_INTERVAL = 3500

// Inline ghost-completions: short patterns the AI is likely to accept.
// Key is the user-typed token (lowercased), value is the rest of a canonical phrase.
const PHRASE_COMPLETIONS: Array<{ match: string; rest: string }> = [
  { match: 'syk',           rest: ' i dag' },
  { match: 'ferie',         rest: ' uke ' },
  { match: 'hjemme',        rest: 'kontor i dag' },
  { match: 'hjemmekontor',  rest: ' i dag' },
  { match: 'kontor',        rest: 'et i morgen' },
  { match: 'kontoret',      rest: ' i morgen' },
  { match: 'reise',         rest: ' uke ' },
  { match: 'kunde',         rest: ' uke ' },
  { match: 'fri',           rest: ' i dag' },
]

interface AIInputProps {
  orgId: string
  /**
   * In combined «Alle CalWin»-mode, pass every involved org so ghost
   * completion knows about members across all workspaces. Defaults to
   * `[orgId]` when omitted.
   */
  orgIds?: string[]
  /**
   * Override the rotating placeholder examples. Use to scope hints to the
   * page's intent — e.g. only vacation phrases on /sommer.
   */
  placeholders?: readonly string[]
}

type InputState = 'idle' | 'loading' | 'success' | 'error'

export function AIInput({ orgId, orgIds, placeholders }: AIInputProps) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<InputState>('idle')
  const [focused, setFocused] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)
  const [clarification, setClarification] = useState<string | null>(null)
  const [memberNames, setMemberNames] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const haptic = useHaptic()
  const t = useT()
  const PLACEHOLDERS = placeholders ?? t.aiInput.placeholder

  // Join orgIds into a stable string so the effect doesn't re-run on every
  // render just because the parent rebuilt the array.
  const orgIdsKey = (orgIds ?? [orgId]).join(',')

  // Fetch just the display names for ghost-completion. Cheap and cached by
  // Supabase; we only need the string list so the payload is tiny.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const ids = orgIdsKey.split(',')
    supabase
      .from('members')
      .select('display_name')
      .in('org_id', ids)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        setMemberNames((data ?? []).map((m: { display_name: string }) => m.display_name))
      })
    return () => { cancelled = true }
  }, [orgIdsKey])

  // Deferring the value used for ghost computation keeps the input itself
  // updating synchronously at native typing speed — React can drop ghost
  // recomputations when keystrokes arrive faster than they can render.
  const deferredValue = useDeferredValue(value)
  const ghost = useMemo(
    () => computeGhost(deferredValue, memberNames),
    [deferredValue, memberNames],
  )

  // Rotate placeholder when idle and not focused. Depending on `value` directly
  // would tear down + recreate the interval on every keystroke; instead we
  // depend on the boolean "is empty" so the effect only runs when the user
  // transitions between empty <-> non-empty.
  const isEmpty = value === ''
  useEffect(() => {
    if (focused || !isEmpty) return
    rotateRef.current = setInterval(() => {
      setPlaceholderVisible(false)
      setTimeout(() => {
        setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length)
        setPlaceholderVisible(true)
      }, 300)
    }, ROTATE_INTERVAL)
    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current)
    }
  }, [focused, isEmpty, PLACEHOLDERS.length])

  // Global ⌘K is owned by the command palette; "/" focuses this input from anywhere.
  // The palette also exposes a "Skriv statusoppdatering" action that routes here.

  const submit = useCallback(async (override?: string) => {
    const text = (override ?? value).trim()
    if (!text || state === 'loading') return

    // Optimistic clear — input empties in the same frame the user hits Enter.
    // If the server fails or asks for clarification, we restore the text.
    setClarification(null)
    setState('loading')
    setValue('')

    try {
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json() as {
        success: boolean
        clarification?: string
        updates?: Array<{ member_name: string }>
        action?: string
        error?: string
      }

      if (!res.ok || data.error) {
        setState('error')
        setValue(text) // restore so the user can fix and retry
        haptic('error')
        toast.error(data.error ?? t.aiInput.error)
        setTimeout(() => setState('idle'), 2000)
        return
      }

      if (data.clarification) {
        setState('idle')
        setValue(text) // restore so the user can amend
        setClarification(data.clarification)
        return
      }

      // Success
      setState('success')
      haptic('success')
      // Broadcast so useEntries can refetch immediately — belt-and-braces
      // alongside Supabase realtime, which can lag or drop reconnected events.
      window.dispatchEvent(new CustomEvent('teampulse:entries-changed'))
      const names = data.updates?.map(u => u.member_name).join(', ')
      toast.success(names ? `${t.aiInput.success} — ${names}` : t.aiInput.success)
      setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('error')
      setValue(text) // restore on network failure
      toast.error(t.aiInput.error)
      setTimeout(() => setState('idle'), 2000)
    }
  }, [value, state, t, haptic])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab or Right-arrow at end of value accepts the ghost completion.
    if (ghost && (e.key === 'Tab' || (e.key === 'ArrowRight' && inputRef.current?.selectionStart === value.length))) {
      e.preventDefault()
      setValue(value + ghost)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      setClarification(null)
      inputRef.current?.blur()
    }
  }

  const isLoading = state === 'loading'
  const isSuccess = state === 'success'

  const borderColor = focused
    ? isLoading
      ? 'var(--lg-accent)'
      : isSuccess
        ? 'var(--success)'
        : 'var(--lg-accent)'
    : 'var(--lg-divider)'

  const boxShadow = focused ? (isSuccess ? GLOW_OK : GLOW_FOCUS) : GLOW_NONE

  // Clarification chips reuse the page-scoped placeholder pool — they're the
  // canonical phrasings the AI groks best, so they double as "try one of these".
  const chipExamples = useMemo(() => PLACEHOLDERS.slice(0, 3), [PLACEHOLDERS])

  return (
    <div className="w-full space-y-2">
      {/* Glow lives on a plain div via a CSS transition — Framer Motion
          re-evaluating a spring on every keystroke was a measurable cost. */}
      <div
        className="rounded-2xl relative"
        style={{
          boxShadow,
          transition: 'box-shadow 220ms ease',
        }}
      >
        <div
          className="relative flex items-center gap-3 px-5 py-[16px] rounded-2xl border"
          style={{
            // Solid background — the backdrop-filter has been moved onto a
            // dedicated sibling layer below so input keystrokes don't trigger
            // a backdrop recomposite, which was the dominant source of jank.
            background: 'var(--lg-panel-bg)',
            borderColor,
            borderWidth: 1,
            transition: 'border-color 180ms ease',
            // Hint the compositor that this subtree owns its own layout,
            // style, and paint — keystrokes can't invalidate parents.
            contain: 'layout paint',
          }}
        >
          {/* Isolated backdrop-blur layer. It paints once and stays put while
              the input's text node changes above it. Pointer-events off so
              clicks fall through to the input. */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              // Force its own compositing layer so the input above doesn't
              // dirty the backdrop on every keystroke.
              transform: 'translateZ(0)',
              willChange: 'transform',
            }}
          />

          {/* Left icon — state indicator. Memoized so typing doesn't re-mount
              Framer Motion components on every keystroke. */}
          <StateIcon state={state} />

          {/* Input */}
          <div className="relative flex-1">
            {/* Animated custom placeholder (shown when empty + not focused) */}
            {!value && !focused && (
              <motion.span
                key={placeholderIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: placeholderVisible ? 1 : 0 }}
                transition={{ duration: 0.32, ease: ease.horizon }}
                className="absolute inset-0 flex items-center pointer-events-none select-none"
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: '17px',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {PLACEHOLDERS[placeholderIdx]}
              </motion.span>
            )}

            {/* Ghost completion — renders the current input invisibly so
                the ghost lines up 1:1 with the live text, then paints the
                completion in a muted tone directly after. Tab or → accepts.
                pr-14 reserves space so the absolute Tab-pill never overlaps. */}
            {ghost && focused && !isLoading && (
              <div
                aria-hidden
                className="absolute inset-0 flex items-center pointer-events-none select-none pr-14"
                style={{
                  fontSize: '17px',
                  fontFamily: 'var(--font-body)',
                  whiteSpace: 'pre',
                  overflow: 'hidden',
                }}
              >
                <span style={{ color: 'transparent' }}>{value}</span>
                <span style={{ color: 'var(--text-tertiary)', opacity: 0.75 }}>{ghost}</span>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => {
                setValue(e.target.value)
                if (clarification) setClarification(null)
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={isLoading}
              placeholder={focused ? t.aiInput.label : ''}
              className="relative w-full bg-transparent outline-none disabled:opacity-50"
              style={{
                fontSize: '15px',
                color: 'var(--lg-text-1)',
                fontFamily: 'var(--font-body)',
                caretColor: 'var(--lg-accent)',
              }}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="send"
              inputMode="text"
            />

            {/* Tab hint — absolute so its appearance never reflows the input.
                Plain CSS transition instead of AnimatePresence so it doesn't
                re-run motion machinery on every keystroke. */}
            <span
              aria-hidden
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md flex items-center gap-1 pointer-events-none"
              style={{
                color: 'var(--text-tertiary)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-body)',
                opacity: ghost && focused && !isLoading && !value.endsWith(' ') ? 1 : 0,
                transform: `translateY(-50%) scale(${ghost && focused ? 1 : 0.85})`,
                transition: 'opacity 150ms ease, transform 150ms ease',
              }}
            >
              ↹ Tab
            </span>
          </div>

          {/* Right side — fixed 36×36 slot, so swapping shortcut/send never reflows.
              Plain button + CSS transitions; Framer's whileHover/whileTap was
              re-evaluating on every parent render (i.e. every keystroke). */}
          <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center">
            <SendOrShortcut
              hasValue={!!value}
              isLoading={isLoading}
              focused={focused}
              onSend={() => submit()}
              sendTitle={t.aiInput.sendTitle}
            />
          </div>
        </div>
      </div>

      {/* Clarification message — with click-to-fill example chips so the user
          gets actionable hints instead of a generic "didn't understand". */}
      <AnimatePresence>
        {clarification && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={spring.gentle}
          >
            <div
              className="px-4 py-3 rounded-xl text-[13px]"
              style={{
                backgroundColor: 'var(--lg-surface-2)',
                border: '1px solid var(--lg-divider)',
                color: 'var(--lg-text-2)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <div className="flex items-start gap-2.5">
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--lg-accent)' }}>
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth={1.5} />
                  <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
                </svg>
                <span>{clarification}</span>
              </div>
              {chipExamples.length > 0 && (
                <div className="mt-2.5 ml-[26px] flex flex-wrap gap-1.5">
                  {chipExamples.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setValue(ex)
                        setClarification(null)
                        inputRef.current?.focus()
                      }}
                      className="px-2.5 py-1 rounded-full text-[12px] transition-colors"
                      style={{
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--lg-text-2)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** State indicator icon. Memoized on `state` so the parent re-rendering on every
 *  keystroke doesn't churn Framer Motion's enter/exit machinery. */
const StateIcon = memo(function StateIcon({ state }: { state: InputState }) {
  const isLoading = state === 'loading'
  const isSuccess = state === 'success'
  return (
    <div className="flex-shrink-0 w-5 h-5 relative">
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={spring.snappy}
            className="absolute inset-0 rounded-full border-2 border-[var(--accent-color)] border-t-transparent animate-spin"
          />
        ) : isSuccess ? (
          <motion.svg
            key="success"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={spring.bouncy}
            viewBox="0 0 20 20"
            fill="none"
            className="absolute inset-0 w-5 h-5"
          >
            <motion.path
              d="M4 10l4.5 4.5L16 6"
              stroke="var(--success)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: ease.horizon }}
            />
          </motion.svg>
        ) : (
          <motion.svg
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            viewBox="0 0 20 20"
            fill="none"
            className="absolute inset-0 w-5 h-5"
          >
            <path
              d="M17.5 10c0 4.14-3.36 7.5-7.5 7.5S2.5 14.14 2.5 10 5.86 2.5 10 2.5s7.5 3.36 7.5 7.5Z"
              stroke="var(--text-tertiary)"
              strokeWidth={1.5}
            />
            <path
              d="M10 6.5v4l2.5 1.5"
              stroke="var(--text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  )
})

/** Send button / "/" shortcut affordance. Plain button + CSS transitions so it
 *  doesn't trigger Framer Motion hover/tap recalc on every keystroke. */
function SendOrShortcut({
  hasValue,
  isLoading,
  focused,
  onSend,
  sendTitle,
}: {
  hasValue: boolean
  isLoading: boolean
  focused: boolean
  onSend: () => void
  sendTitle: string
}) {
  const showSend = hasValue && !isLoading
  const showShortcut = !focused && !hasValue
  return (
    <div className="relative w-9 h-9">
      <button
        type="button"
        onClick={onSend}
        disabled={!showSend}
        className="absolute inset-0 flex items-center justify-center rounded-xl ai-send-btn"
        style={{
          background: 'var(--lg-accent)',
          boxShadow: '0 0 0 3px rgba(139, 92, 246, 0.18), 0 0 18px var(--lg-accent-glow)',
          opacity: showSend ? 1 : 0,
          transform: `scale(${showSend ? 1 : 0.8})`,
          pointerEvents: showSend ? 'auto' : 'none',
          transition: 'opacity 160ms ease, transform 160ms ease',
        }}
        title={sendTitle}
        aria-label={sendTitle}
        aria-hidden={!showSend}
      >
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="white"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span
        aria-hidden={!showShortcut}
        className="lg-mono text-[10.5px] px-1.5 py-0.5 rounded-md border absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          color: 'var(--lg-text-3)',
          borderColor: 'var(--lg-divider)',
          backgroundColor: 'var(--lg-surface-2)',
          opacity: showShortcut ? 1 : 0,
          transition: 'opacity 180ms ease',
        }}
      >
        /
      </span>
      <style jsx>{`
        .ai-send-btn:not(:disabled):hover { transform: scale(1.04) !important; }
        .ai-send-btn:not(:disabled):active { transform: scale(0.94) !important; }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** Return the `rest` of a likely completion for the current input value, or ''.
 *  Matches against member display names first (highest value), then a short
 *  list of canonical status phrases. Case-insensitive, only completes when the
 *  user has typed ≥ 2 chars of a final token. */
function computeGhost(value: string, memberNames: string[]): string {
  if (!value) return ''
  // Only offer completions while the user is still typing the final token —
  // a trailing space means they've "sealed" it and likely want the next word.
  const trimmed = value.trimStart()
  if (trimmed !== value) return ''
  if (value.endsWith(' ')) return ''

  // Find the last whitespace-separated token — that's what we're completing.
  const tokens = value.split(/\s+/)
  const last = tokens[tokens.length - 1]
  if (last.length < 2) return ''

  const prefix = last.toLowerCase()

  // 1. Member names — case-insensitive startsWith on the first name.
  for (const name of memberNames) {
    const first = name.split(' ')[0]
    if (first.toLowerCase().startsWith(prefix) && first.length > last.length) {
      return first.slice(last.length)
    }
    // Also try matching on full display name for users typing "Øystein Pi..."
    if (name.toLowerCase().startsWith(prefix) && name.length > last.length) {
      return name.slice(last.length)
    }
  }

  // 2. Phrase patterns — whole-token matches (e.g. typing "syk" → " i dag").
  //    Only activates when the last token fully matches the pattern key.
  for (const p of PHRASE_COMPLETIONS) {
    if (prefix === p.match) return p.rest
  }

  // 3. Prefix-of-pattern — typed "sy" → "k i dag". Gives immediate feedback.
  for (const p of PHRASE_COMPLETIONS) {
    if (p.match.startsWith(prefix) && p.match.length > prefix.length) {
      return p.match.slice(prefix.length) + p.rest
    }
  }

  return ''
}
