// Per-member location badge. Reads the member's explicit `location_code`
// ('GB' or 'NO') so every surface — Oversikt, Sommer, TV-dashboard — shows
// the same signal. GB renders the label "UK" because that's how CalWin
// refers to the office internally; everything else is "NO". Rendered as a
// round, outlined chip: a brand-coloured ring with the code inside, instead
// of a filled pill, so it reads as a quiet location marker next to the name.

type LocationCode = 'NO' | 'GB'

const LOCATION_BADGE: Record<LocationCode, { label: string; ring: string; fg: string; bg: string }> = {
  NO: { label: 'NO', ring: '#66C4EF', fg: '#1F5E86', bg: 'rgba(102,196,239,0.14)' }, // CalWin light blue
  GB: { label: 'UK', ring: '#322E7A', fg: '#322E7A', bg: 'rgba(50,46,122,0.12)' }, // CalWin blue violet
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
  const dim = size === 'sm' ? 17 : 21
  return (
    <span
      aria-label={`Lokasjon: ${c.label}`}
      title={c.label}
      className="inline-flex items-center justify-center shrink-0 rounded-full font-semibold uppercase tabular-nums"
      style={{
        width: dim,
        height: dim,
        background: c.bg,
        color: c.fg,
        border: `1.5px solid ${c.ring}`,
        fontSize: size === 'sm' ? 8.5 : 10,
        lineHeight: 1,
        letterSpacing: '0.04em',
        fontFamily: 'var(--font-body)',
      }}
    >
      {c.label}
    </span>
  )
}
