export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      {/* AI input skeleton */}
      <div
        className="rounded-2xl h-[64px]"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
          border: '1.5px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
          boxShadow: '0 12px 32px -12px rgba(0, 102, 255, 0.14), 0 4px 10px rgba(0,0,0,0.04)',
        }}
      />

      {/* Team grid skeleton */}
      <div className="space-y-10">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
          <div className="h-8 w-24 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
        </div>

        <div
          className="rounded-3xl p-4"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
          }}
        >
          <div className="grid gap-2 px-4 py-4" style={{ gridTemplateColumns: '88px repeat(5, 1fr)' }}>
            <div />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-[var(--bg-subtle)] animate-pulse" />
            ))}
          </div>
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, r) => (
              <div
                key={r}
                className="grid gap-2 items-center"
                style={{ gridTemplateColumns: '88px repeat(5, 1fr)' }}
              >
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
                  <div className="h-2.5 w-12 rounded bg-[var(--bg-subtle)] animate-pulse" />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-[84px] rounded-2xl bg-[var(--bg-subtle)] animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
