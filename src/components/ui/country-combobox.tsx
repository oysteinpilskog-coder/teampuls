'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Search } from 'lucide-react'
import { spring } from '@/lib/motion'
import { useLocale } from '@/lib/i18n/context'
import { LOCALE_META } from '@/lib/i18n/types'
import { getCountryOptions } from '@/lib/countries'

interface CountryComboboxProps {
  value: string
  onChange: (code: string) => void
  placeholder?: string
  favorites?: readonly string[]
  className?: string
  ariaLabel?: string
}

const FAVORITE_COUNT_HINT = 5

export function CountryCombobox({
  value,
  onChange,
  placeholder = 'Velg land',
  favorites,
  className,
  ariaLabel,
}: CountryComboboxProps) {
  const locale = useLocale()
  const intlLocale = LOCALE_META[locale].intl
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const options = useMemo(
    () => getCountryOptions(intlLocale, favorites),
    [intlLocale, favorites],
  )

  const selected = useMemo(
    () => options.find(o => o.code === value),
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q),
    )
  }, [options, query])

  // Keep activeIdx in range whenever the filtered list shrinks/grows.
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // Focus search when opening; restore focus on trigger when closing.
  useEffect(() => {
    if (open) {
      // Defer to next tick so Framer can mount the popup before focus.
      const id = window.setTimeout(() => inputRef.current?.focus(), 10)
      return () => window.clearTimeout(id)
    }
  }, [open])

  // Click outside to close.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Auto-scroll the active item into view.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  function commit(code: string) {
    onChange(code)
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[activeIdx]
      if (pick) commit(pick.code)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
      triggerRef.current?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIdx(filtered.length - 1)
    }
  }

  // Visually separate pinned favorites from alphabetical rest. Only relevant
  // when the user hasn't started filtering — once they search, ordering by
  // match relevance matters more than the pin grouping.
  const showSeparatorAt = query.trim() ? -1 : Math.min(FAVORITE_COUNT_HINT, options.length) - 1

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2.5 rounded-xl text-[14px] outline-none appearance-none cursor-pointer text-left flex items-center justify-between gap-2"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontFamily: 'var(--font-body)',
          border: '1.5px solid transparent',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A8A29E"
          strokeWidth="1.5"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring.snappy}
            className="absolute z-50 mt-1.5 w-full rounded-xl overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              boxShadow:
                '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
              maxHeight: 320,
            }}
            onKeyDown={handleKeyDown}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <Search className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Søk etter land …"
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            <div ref={listRef} className="overflow-y-auto py-1" style={{ maxHeight: 260 }}>
              {filtered.length === 0 ? (
                <div
                  className="px-3 py-6 text-center text-[12px]"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                >
                  Ingen treff
                </div>
              ) : (
                filtered.map((opt, idx) => {
                  const isActive = idx === activeIdx
                  const isSelected = opt.code === value
                  const isLastFavorite = idx === showSeparatorAt
                  return (
                    <div key={opt.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-idx={idx}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => commit(opt.code)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors"
                        style={{
                          backgroundColor: isActive ? 'var(--bg-subtle)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[10px] font-semibold tabular-nums shrink-0 px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: 'var(--bg-subtle)',
                              color: 'var(--text-tertiary)',
                              fontFamily: 'var(--font-sora)',
                              border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                            }}
                          >
                            {opt.code}
                          </span>
                          <span className="truncate">{opt.label}</span>
                        </span>
                        {isSelected && (
                          <Check
                            className="w-4 h-4 shrink-0"
                            strokeWidth={2}
                            style={{ color: 'var(--accent-color)' }}
                          />
                        )}
                      </button>
                      {isLastFavorite && (
                        <div
                          className="my-1 mx-3"
                          style={{ borderTop: '1px solid var(--border-subtle)' }}
                        />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
