import Link from 'next/link'
import { getServerDict } from '@/lib/i18n/server'

export default async function NotFound() {
  const t = await getServerDict()
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <p
        className="text-[96px] font-bold leading-none mb-4 select-none"
        style={{
          fontFamily: 'var(--font-sora)',
          color: 'var(--border-strong)',
          letterSpacing: '-0.04em',
        }}
      >
        404
      </p>
      <h1
        className="text-[24px] font-semibold mb-2"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sora)' }}
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
        className="px-6 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--accent-color)', fontFamily: 'var(--font-body)' }}
      >
        {t.common.backToOverview}
      </Link>
    </div>
  )
}
