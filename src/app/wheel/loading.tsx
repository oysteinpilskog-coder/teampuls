export default function Loading() {
  return (
    <div className="mx-auto max-w-[1220px] px-4 sm:px-6 py-8">
      <div className="flex items-center justify-center" style={{ minHeight: '600px' }}>
        <div
          className="relative rounded-full animate-pulse"
          style={{
            width: 520,
            height: 520,
            background: 'radial-gradient(circle at center, color-mix(in oklab, var(--bg-elevated) 92%, transparent), color-mix(in oklab, var(--bg-subtle) 100%, transparent))',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 50%, transparent)',
            boxShadow: '0 24px 64px -24px rgba(0,0,0,0.12)',
          }}
        >
          {/* Concentric rings hint */}
          {[0.82, 0.64, 0.46, 0.28].map((s) => (
            <div
              key={s}
              className="absolute rounded-full"
              style={{
                inset: `${((1 - s) / 2) * 100}%`,
                border: '1px solid color-mix(in oklab, var(--border-subtle) 40%, transparent)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
