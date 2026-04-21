export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <div
        className="rounded-2xl h-[64px]"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
          border: '1.5px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
          boxShadow: '0 12px 32px -12px rgba(0, 102, 255, 0.14), 0 4px 10px rgba(0,0,0,0.04)',
        }}
      />

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-[var(--bg-subtle)] animate-pulse" />
          <div className="h-4 w-24 rounded bg-[var(--bg-subtle)] animate-pulse" />
        </div>
      </div>

      <div
        className="rounded-3xl p-6 space-y-3"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl bg-[var(--bg-subtle)] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
