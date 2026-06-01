// Per-member location badge. Reads the member's explicit `location_code`
// ('GB' or 'NO') so every surface — Oversikt, Sommer, TV-dashboard — shows
// the same signal. GB renders the label "UK" because that's how CalWin
// refers to the office internally; everything else is "NO". Rendered as a
// filled, glossy circle in the brand palette (NO = Light Blue, UK = Blue
// Violet) so the location reads as a solid, lined-up marker in its own
// column rather than a faint outline behind the name.

type LocationCode = 'NO' | 'GB'

const LOCATION_BADGE: Record<LocationCode, { label: string; bg: string; fg: string }> = {
  NO: { label: 'NO', bg: '#66C4EF', fg: '#1F1C52' }, // Light Blue fill, Blue Violet text
  GB: { label: 'UK', bg: '#322E7A', fg: '#FFFFFF' }, // Blue Violet fill, white text
}

function normalize(code: string | null | undefined): LocationCode {
  return code === 'GB' ? 'GB' : 'NO'
}

export function CountryBadge({
  countryCode,
  size = 'sm',
}: {
  countryCode: string | null | undefined
  size?: 'sm' | 'md'
}) {
  const c = LOCATION_BADGE[normalize(countryCode)]
  const dim = size === 'sm' ? 22 : 26
  return (
    <span
      aria-label={`Lokasjon: ${c.label}`}
      title={c.label}
      className="inline-flex items-center justify-center shrink-0 rounded-full font-semibold uppercase tabular-nums"
      style={{
        width: dim,
        height: dim,
        background: `linear-gradient(135deg, color-mix(in oklab, ${c.bg} 86%, white) 0%, ${c.bg} 100%)`,
        color: c.fg,
        fontSize: size === 'sm' ? 9.5 : 11,
        lineHeight: 1,
        letterSpacing: '0.03em',
        fontFamily: 'var(--font-body)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px rgba(31,28,82,0.25)',
      }}
    >
      {c.label}
    </span>
  )
}
