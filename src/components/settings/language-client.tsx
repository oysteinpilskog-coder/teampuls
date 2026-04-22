'use client'

import { Languages } from 'lucide-react'
import { useT } from '@/lib/i18n/context'
import { LanguageGrid } from '@/components/language-switcher'

export function LanguageClient() {
  const t = useT()
  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-[24px] font-semibold flex items-center gap-2"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
        >
          <Languages className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent-color)' }} />
          {t.settings.language.title}
        </h1>
        <p
          className="text-[14px] mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.settings.language.subtitle}
        </p>
      </div>
      <LanguageGrid />
    </div>
  )
}
