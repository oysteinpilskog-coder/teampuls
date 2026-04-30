import Link from 'next/link'
import { getServerDict } from '@/lib/i18n/server'

export default async function NotFound() {
  const t = await getServerDict()
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center tp-not-found">
      <span
        aria-hidden
        className="text-[120px] leading-none mb-6 select-none italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontWeight: 300,
          fontVariationSettings: '"opsz" 144, "SOFT" 80',
          color: 'var(--accent-color)',
          letterSpacing: '-0.04em',
        }}
      >
        404
      </span>
      <h1
        className="text-[24px] font-semibold mb-2"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.02em' }}
      >
        {t.notFound.title}
      </h1>
      <p
        className="text-[15px] mb-8 max-w-sm"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        {t.notFound.description}
      </p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
        style={{
          backgroundColor: 'var(--accent-color)',
          boxShadow: 'var(--shadow-accent)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {t.common.backToOverview}
      </Link>
    </div>
  )
}
