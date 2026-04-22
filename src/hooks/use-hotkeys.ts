'use client'

import { useEffect } from 'react'

/** A hotkey spec: either a single printable key ("t", "?", "/") or a modifier
 *  combo ("mod+k" for Cmd/Ctrl+K). Modifiers: mod (meta or ctrl), shift, alt. */
export type Hotkey = string

interface Options {
  /** If true, fire even when the user is typing in an input or textarea. */
  allowInInputs?: boolean
  /** Disable without unmounting the hook. */
  disabled?: boolean
  /** Call preventDefault on the event when the hotkey matches. Default true. */
  preventDefault?: boolean
}

/** Register a keyboard shortcut. Handler re-reads from a ref so you can
 *  safely close over fresh state without re-registering. */
export function useHotkeys(hotkey: Hotkey | Hotkey[], handler: (e: KeyboardEvent) => void, opts: Options = {}) {
  useEffect(() => {
    if (opts.disabled) return
    const keys = Array.isArray(hotkey) ? hotkey : [hotkey]
    const matchers = keys.map(parseHotkey)

    function onKey(e: KeyboardEvent) {
      if (!opts.allowInInputs && isTypingTarget(e.target)) return
      for (const m of matchers) {
        if (matches(e, m)) {
          if (opts.preventDefault !== false) e.preventDefault()
          handler(e)
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(hotkey) ? hotkey.join('|') : hotkey, opts.disabled, opts.allowInInputs, opts.preventDefault])
}

interface ParsedHotkey {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

function parseHotkey(h: Hotkey): ParsedHotkey {
  const parts = h.toLowerCase().split('+').map((s) => s.trim())
  const result: ParsedHotkey = { key: '', mod: false, shift: false, alt: false }
  for (const p of parts) {
    if (p === 'mod' || p === 'cmd' || p === 'ctrl' || p === 'meta') result.mod = true
    else if (p === 'shift') result.shift = true
    else if (p === 'alt' || p === 'option') result.alt = true
    else result.key = p
  }
  return result
}

function matches(e: KeyboardEvent, m: ParsedHotkey): boolean {
  const modPressed = e.metaKey || e.ctrlKey
  if (m.mod !== modPressed) return false
  if (m.shift !== e.shiftKey) return false
  if (m.alt !== e.altKey) return false

  // For ?, users often type shift+/, so the event.key resolves to "?" already.
  // Normalise on event.key (printable char) when available.
  const k = e.key.toLowerCase()
  if (m.key === k) return true
  // Allow arrow aliases
  if (m.key === 'left' && k === 'arrowleft') return true
  if (m.key === 'right' && k === 'arrowright') return true
  if (m.key === 'up' && k === 'arrowup') return true
  if (m.key === 'down' && k === 'arrowdown') return true
  return false
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
