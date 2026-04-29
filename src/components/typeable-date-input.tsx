'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { formatDateInputDisplay, parseDateInput } from '@/lib/dates'
import { useT, useLocale } from '@/lib/i18n/context'

interface TypeableDateInputProps {
  value: string                          // 'YYYY-MM-DD' or ''
  onChange: (iso: string) => void        // '' = cleared
  placeholder?: string
  ariaLabel?: string
  accentColor?: string
  /** Show a small calendar icon on the left. Default true. */
  showIcon?: boolean
  /** Show a clear (×) button when filled. Default true. */
  showClear?: boolean
  /** Compact variant — smaller padding for inline use in headers. */
  compact?: boolean
  className?: string
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}

/**
 * Free-form date input. The user can type any of these and the value
 * commits as 'YYYY-MM-DD' on blur (or on every keystroke once the buffer
 * parses cleanly):
 *
 *   2026-04-21 · 21.04.2026 · 21/4/26 · 21. april · 21 apr 2026
 *
 * Year defaults to the current year. Two-digit years follow the standard
 * 1970-cutoff rule. Invalid input shows a subtle red border and is held
 * in the buffer until corrected — never blocks typing.
 */
export const TypeableDateInput = forwardRef<HTMLInputElement, TypeableDateInputProps>(
  function TypeableDateInput(
    {
      value,
      onChange,
      placeholder,
      ariaLabel,
      accentColor = 'var(--accent-color)',
      showIcon = true,
      showClear = true,
      compact = false,
      className,
      onFocus,
      onBlur,
    },
    ref,
  ) {
    const t = useT()
    const locale = useLocale()
    const [text, setText] = useState(() => formatDateInputDisplay(value, locale))
    const [invalid, setInvalid] = useState(false)
    const [focused, setFocused] = useState(false)
    // Tracks the last ISO value we either received or emitted, so we can
    // distinguish external (calendar) changes from echoes of our own onChange.
    const lastValueRef = useRef(value)

    // Sync text when value changes externally (e.g. calendar click).
    // Run even while focused, so picking a day on the calendar updates the
    // visible text — but only when the change didn't originate from us.
    useEffect(() => {
      if (value !== lastValueRef.current) {
        lastValueRef.current = value
        setText(formatDateInputDisplay(value, locale))
        setInvalid(false)
      }
    }, [value, locale])

    function handleChange(next: string) {
      setText(next)
      const trimmed = next.trim()
      if (!trimmed) {
        setInvalid(false)
        if (value !== '') {
          lastValueRef.current = ''
          onChange('')
        }
        return
      }
      const iso = parseDateInput(trimmed)
      if (iso) {
        setInvalid(false)
        if (iso !== value) {
          lastValueRef.current = iso
          onChange(iso)
        }
      } else {
        // Don't fire onChange — let the user keep typing.
        setInvalid(false) // hide red border while typing; only show on blur.
      }
    }

    function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
      setFocused(false)
      const trimmed = text.trim()
      if (!trimmed) {
        setInvalid(false)
        if (value !== '') {
          lastValueRef.current = ''
          onChange('')
        }
        onBlur?.(e)
        return
      }
      const iso = parseDateInput(trimmed)
      if (iso) {
        setInvalid(false)
        lastValueRef.current = iso
        if (iso !== value) onChange(iso)
        // Reformat to canonical locale display.
        setText(formatDateInputDisplay(iso, locale))
      } else {
        setInvalid(true)
      }
      onBlur?.(e)
    }

    function clear() {
      setText('')
      setInvalid(false)
      if (value !== '') {
        lastValueRef.current = ''
        onChange('')
      }
    }

    const padX = compact ? 'px-2.5' : 'px-3'
    const padY = compact ? 'py-1.5' : 'py-2.5'
    const iconLeft = compact ? 8 : 10
    const padLeft = showIcon ? (compact ? 28 : 34) : undefined

    const borderColor = invalid
      ? 'var(--accent-color-danger, #f5556d)'
      : focused
        ? accentColor
        : 'transparent'

    return (
      <div className={`relative ${className ?? ''}`}>
        {showIcon && (
          <CalendarIcon
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: iconLeft,
              width: 14,
              height: 14,
              color: 'var(--text-tertiary)',
            }}
            strokeWidth={1.75}
          />
        )}
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          value={text}
          placeholder={placeholder ?? t.dateInput.placeholder}
          onChange={e => handleChange(e.target.value)}
          onFocus={e => { setFocused(true); onFocus?.(e) }}
          onBlur={handleBlur}
          className={`w-full ${padX} ${padY} rounded-xl text-[14px] outline-none tabular-nums transition-[border-color] duration-150`}
          style={{
            backgroundColor: 'var(--bg-subtle)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            border: `1.5px solid ${borderColor}`,
            paddingLeft: padLeft,
            paddingRight: showClear && text ? (compact ? 26 : 30) : undefined,
          }}
        />
        {showClear && text && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={e => { e.preventDefault(); clear() }}
            aria-label={t.common.cancel}
            className="absolute top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors"
            style={{
              right: compact ? 6 : 8,
              color: 'var(--text-tertiary)',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X style={{ width: 12, height: 12 }} strokeWidth={1.75} />
          </button>
        )}
      </div>
    )
  },
)
