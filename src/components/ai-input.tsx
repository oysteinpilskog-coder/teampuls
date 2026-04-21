'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { no } from '@/lib/i18n/no'
import { spring } from '@/lib/motion'

const PLACEHOLDERS = no.aiInput.placeholder
const ROTATE_INTERVAL = 3500

interface AIInputProps {
  orgId: string
}

type InputState = 'idle' | 'loading' | 'success' | 'error'

export function AIInput({ orgId: _orgId }: AIInputProps) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<InputState>('idle')
  const [focused, setFocused] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)
  const [clarification, setClarification] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Rotate placeholder when idle and not focused
  useEffect(() => {
    if (focused || value) {
      if (rotateRef.current) clearInterval(rotateRef.current)
      return
    }
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
  }, [focused, value])

  // ⌘K / Ctrl+K global shortcut to focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = useCallback(async () => {
    const text = value.trim()
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
        toast.error(data.error ?? no.aiInput.error)
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
      const names = data.updates?.map(u => u.member_name).join(', ')
      toast.success(names ? `${no.aiInput.success} — ${names}` : no.aiInput.success)
      setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('error')
      setValue(text) // restore on network failure
      toast.error(no.aiInput.error)
      setTimeout(() => setState('idle'), 2000)
    }
  }, [value, state])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
      ? 'var(--accent-color)'
      : isSuccess
        ? '#16A362'
        : 'var(--accent-color)'
    : 'color-mix(in oklab, var(--border-subtle) 70%, transparent)'

  const glowStyle = focused
    ? {
        boxShadow: isSuccess
          ? '0 0 0 4px rgba(22, 163, 98, 0.15), 0 20px 48px -12px rgba(22, 163, 98, 0.25), var(--shadow-lg)'
          : '0 0 0 4px rgba(0, 102, 255, 0.14), 0 20px 48px -12px rgba(0, 102, 255, 0.3), var(--shadow-lg)',
      }
    : {
        // subtle always-on ambient glow so the field never feels dead
        boxShadow: '0 12px 32px -12px rgba(0, 102, 255, 0.14), 0 4px 10px rgba(0,0,0,0.04), 0 0 0 1px color-mix(in oklab, var(--border-subtle) 50%, transparent)',
      }

  return (
    <div className="w-full space-y-2">
      <motion.div
        animate={glowStyle}
        transition={spring.smooth}
        className="rounded-2xl relative"
      >
        {/* Ambient gradient rim — visible idle, bright on focus */}
        <div
          aria-hidden
          className="absolute -inset-[2px] rounded-2xl pointer-events-none"
          style={{
            background: focused
              ? 'linear-gradient(135deg, rgba(0,102,255,0.85), rgba(139,63,230,0.55) 40%, rgba(255,122,26,0.65) 80%)'
              : 'linear-gradient(135deg, rgba(0,102,255,0.38), rgba(139,63,230,0.22) 40%, rgba(255,122,26,0.28) 80%)',
            filter: 'blur(1px)',
            transition: 'background 250ms ease',
          }}
        />
        {/* Ambient outer bloom for depth */}
        <motion.div
          aria-hidden
          className="absolute rounded-2xl pointer-events-none"
          style={{
            inset: '-10px',
            background: 'radial-gradient(ellipse at center, rgba(0,102,255,0.18), transparent 60%)',
            filter: 'blur(20px)',
          }}
          animate={{ opacity: focused ? 1 : [0.4, 0.7, 0.4] }}
          transition={focused ? { duration: 0.3 } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="relative flex items-center gap-3 px-5 py-[18px] rounded-2xl border transition-colors duration-200"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            borderColor,
            borderWidth: focused ? '2px' : '1.5px',
          }}
        >
          {/* Left icon — animated state indicator */}
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
                    stroke="#16A362"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
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

          {/* Input */}
          <div className="relative flex-1">
            {/* Animated custom placeholder (shown when empty + not focused) */}
            {!value && !focused && (
              <motion.span
                key={placeholderIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: placeholderVisible ? 1 : 0, y: placeholderVisible ? 0 : -4 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
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
              placeholder={focused ? no.aiInput.label : ''}
              className="w-full bg-transparent outline-none disabled:opacity-50"
              style={{
                fontSize: '17px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                caretColor: 'var(--accent-color)',
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Right side — shortcut hint or send button */}
          <div className="flex-shrink-0">
            <AnimatePresence mode="wait">
              {value && !isLoading ? (
                <motion.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  transition={spring.snappy}
                  onClick={submit}
                  className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
                  style={{
                    background: 'linear-gradient(135deg, hsl(220, 95%, 60%), hsl(235, 85%, 55%))',
                    boxShadow: '0 6px 16px rgba(0, 102, 255, 0.35), 0 2px 4px rgba(0, 102, 255, 0.2)',
                  }}
                  title="Send (Enter)"
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
                </motion.button>
              ) : !focused && !value ? (
                <motion.span
                  key="shortcut"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded-md border"
                  style={{
                    color: 'var(--text-tertiary)',
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--bg-subtle)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  ⌘K
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Clarification message */}
      <AnimatePresence>
        {clarification && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={spring.gentle}
          >
            <div
              className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-[14px]"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-color) 8%, var(--bg-elevated))',
                border: '1px solid color-mix(in srgb, var(--accent-color) 20%, transparent)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-color)' }}>
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth={1.5} />
                <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
              </svg>
              <span>{clarification}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
