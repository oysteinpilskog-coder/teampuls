export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex flex-col md:flex-row gap-4 md:gap-10">
        {/* Nav skeleton */}
        <div className="w-full md:w-44 shrink-0 flex flex-col gap-0.5">
          <div className="h-3 w-24 rounded bg-[var(--bg-subtle)] animate-pulse mx-3 mb-3" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-xl bg-[var(--bg-subtle)] animate-pulse"
            />
          ))}
        </div>

        {/* Content skeleton */}
        <div className="flex-1 min-w-0 space-y-6">
          <div className="h-8 w-48 rounded bg-[var(--bg-subtle)] animate-pulse" />
          <div
            className="rounded-2xl p-6 space-y-3"
            style={{
              background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
              border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
