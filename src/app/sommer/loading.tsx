/**
 * Skeleton for /sommer. Speiler matriserygnen i `sommer-month-matrix.tsx`
 * (fane-rad → måned-velger → 5×~15 grid) så Next streamer en
 * kjent-formet ramme i samme frame som brukeren navigerer hit, i stedet
 * for å vente på at SSR-en (members + entries + offices) løser seg.
 *
 * Uten denne så brukeren en blank shell med bare AI-input og en
 * spinning header — føles som et tregt sideskift selv om data-en
 * løser seg på 100-300 ms.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-3 pb-10 space-y-5">
      {/* AI input skeleton */}
      <div className="mx-auto max-w-3xl">
        <div
          className="rounded-2xl h-[64px]"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
            border: '1.5px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
            boxShadow:
              '0 12px 32px -12px color-mix(in oklab, var(--accent-color) 18%, transparent), 0 4px 10px rgba(0,0,0,0.04)',
          }}
        />
      </div>

      {/* Måned-velger skeleton */}
      <div className="flex items-center justify-center gap-2">
        <div className="h-9 w-9 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
        <div className="h-9 w-40 rounded-xl bg-[var(--bg-subtle)] animate-pulse" />
        <div className="h-9 w-9 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
      </div>

      {/* Måned-matrise skeleton (samme proporsjoner som SommerMonthMatrix) */}
      <div
        className="rounded-3xl p-4"
        style={{
          background: 'color-mix(in oklab, var(--bg-elevated) 78%, transparent)',
          border: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        }}
      >
        <div className="space-y-2 p-2">
          {Array.from({ length: 12 }).map((_, r) => (
            <div
              key={r}
              className="grid gap-1.5 items-center"
              style={{ gridTemplateColumns: '88px repeat(20, 1fr)' }}
            >
              <div className="flex flex-col items-center gap-1.5 py-1">
                <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-[var(--bg-subtle)] animate-pulse" />
              </div>
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="h-6 rounded bg-[var(--bg-subtle)] animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
