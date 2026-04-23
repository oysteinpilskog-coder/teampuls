/**
 * Static fallback page served by the service worker when every network
 * request fails and there's no cached page for the requested URL.
 *
 * Intentionally dependency-free — the SW pre-caches this shell on install,
 * so it must render with zero runtime data and no React context.
 *
 * Uses Offiview's Paper/Espresso palette + Fraunces italic headline. The
 * mark is inlined as raw SVG (no component imports) to keep the bundle
 * exactly one server-rendered HTML blob.
 */
export default function OfflinePage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ background: '#15110E', color: '#F5EFE4' }}
    >
      {/* Subtle Ember aurora — warm signal that this is still Offiview, not a 500 page */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 70% 50% at 30% 30%, rgba(180, 83, 9, 0.18) 0%, transparent 55%),' +
            'radial-gradient(ellipse 60% 50% at 70% 70%, rgba(251, 191, 36, 0.08) 0%, transparent 55%)',
          filter: 'blur(30px)',
        }}
      />

      <div
        className="relative max-w-md text-center"
        style={{ zIndex: 1 }}
      >
        {/* Offiview mark — ring + horizon, Paper stroke */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 100 100"
          width="72"
          height="72"
          aria-hidden
          style={{ display: 'block', margin: '0 auto 28px' }}
        >
          <circle cx="50" cy="50" r="47" fill="none" stroke="#F5EFE4" strokeWidth="5" />
          <line
            x1="15" y1="62" x2="85" y2="62"
            stroke="#F5EFE4"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.9"
          />
        </svg>

        {/* Headline — Fraunces italic, opsz 144, SOFT 100 */}
        <h1
          style={{
            fontFamily: '"Fraunces", "Iowan Old Style", Georgia, serif',
            fontWeight: 300,
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 144, "SOFT" 100',
            fontSize: 'clamp(36px, 5.8vw, 54px)',
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
            color: '#F5EFE4',
            marginBottom: 16,
          }}
        >
          Ute av rekkevidde.
        </h1>

        {/* Body — Manrope, warm paper at 60% */}
        <p
          style={{
            fontFamily: '"Manrope", system-ui, -apple-system, sans-serif',
            fontSize: 16,
            lineHeight: 1.55,
            color: 'rgba(245, 239, 228, 0.7)',
            letterSpacing: '-0.005em',
            maxWidth: '30rem',
            margin: '0 auto',
          }}
        >
          Vi prøver igjen når du er tilbake på nett. Offiview holder siste
          visning klar i bakgrunnen.
        </p>

        {/* Manrope mono eyebrow — subtle brand anchor */}
        <p
          style={{
            marginTop: 40,
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(245, 239, 228, 0.38)',
          }}
        >
          Offiview · Offline
        </p>
      </div>
    </main>
  )
}
