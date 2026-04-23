'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { LOCALES, LOCALE_META } from '@/lib/i18n/types'
import { spring } from '@/lib/motion'

export function LanguageGrid() {
  const { locale, dict, setLocale } = useI18n()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {LOCALES.map((code) => {
        const meta = LOCALE_META[code]
        const selected = locale === code
        return (
          <motion.button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            transition={spring.snappy}
            className="relative flex items-center gap-3 px-4 py-3 rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: selected
                ? '1.5px solid var(--accent-color)'
                : '1px solid var(--border-subtle)',
              boxShadow: selected
                ? '0 12px 32px color-mix(in oklab, var(--accent-color) 22%, transparent), 0 0 0 4px color-mix(in oklab, var(--accent-color) 14%, transparent)'
                : 'var(--shadow-sm)',
              transition: 'box-shadow 220ms ease, border-color 220ms ease',
              fontFamily: 'var(--font-body)',
            }}
            aria-pressed={selected}
          >
            <span className="text-[26px] leading-none shrink-0" aria-hidden>
              {meta.flag}
            </span>
            <div className="flex-1 min-w-0">
              <div
                className="text-[15px] font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
              >
                {meta.nativeName}
              </div>
              <div
                className="text-[12.5px] mt-0.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {meta.intl}
              </div>
            </div>
            {selected && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring.snappy}
                className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
                style={{
                  background: 'var(--accent-color)',
                  color: 'white',
                  boxShadow: '0 4px 14px color-mix(in oklab, var(--accent-color) 40%, transparent)',
                }}
                aria-label={dict.settings.language.current}
              >
                <Check className="w-4 h-4" strokeWidth={3} />
              </motion.span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
