/**
 * Static fallback page served by the service worker when every network
 * request fails and there's no cached page for the requested URL.
 * Intentionally dependency-free — the SW pre-caches it on install, so it
 * must render with zero runtime data.
 */
export default function OfflinePage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--lg-bg, #0A0A0B)' }}
    >
      <div className="max-w-md text-center">
        <div
          className="mx-auto mb-6 rounded-full flex items-center justify-center"
          style={{
            width: 64,
            height: 64,
            background:
              'linear-gradient(155deg, color-mix(in oklab, #8B5CF6 18%, transparent), transparent 60%)',
            boxShadow:
              '0 0 0 1px color-mix(in oklab, #8B5CF6 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.08)',
            color: '#A780FF',
          }}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
            <path
              d="M3 9a16 16 0 0 1 18 0M6 12a12 12 0 0 1 12 0M9 15a8 8 0 0 1 6 0M12 19v.01"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1
          className="font-bold"
          style={{
            fontFamily: 'var(--font-sora, system-ui)',
            color: 'var(--lg-text-1, #F5F5F7)',
            fontSize: 28,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          Ingen internett-tilkobling
        </h1>
        <p
          className="mt-3"
          style={{
            fontFamily: 'var(--font-body, system-ui)',
            color: 'var(--lg-text-2, #A1A1AA)',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Vi prøver igjen når du er tilbake på nett. TeamPulse holder siste visning
          klar i bakgrunnen.
        </p>
      </div>
    </main>
  )
}
