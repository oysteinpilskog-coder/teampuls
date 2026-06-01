import { isSupportedCountry, type CountryCode } from '@/lib/holidays'

// Per-country location badge. Drives off the member's home-office
// country_code so every surface (Oversikt, Sommer, TV-dashboard) reads the
// same location signal. NO = Light Blue and GB = Blue Violet are the two
// CalWin brand blues; SE/LT get their own distinct hues so the four offices
// never collapse into "looks the same". GB renders the label "UK" because
// that's how CalWin refers to the office internally.
const COUNTRY_BADGE: Record<CountryCode, { label: string; bg: string; fg: string }> = {
  NO: { label: 'NO', bg: '#66C4EF', fg: '#1F1C52' }, // Light Blue
  GB: { label: 'UK', bg: '#322E7A', fg: '#FFFFFF' }, // Blue Violet (dark)
  SE: { label: 'SE', bg: '#F5C518', fg: '#1F1C52' }, // Swedish gold
  LT: { label: 'LT', bg: '#1F9E5A', fg: '#FFFFFF' }, // Lithuanian green
}

export function CountryBadge({
  countryCode,
  size = 'sm',
}: {
  countryCode: string | null | undefined
  size?: 'sm' | 'md'
}) {
  if (!isSupportedCountry(countryCode)) return null
  const c = COUNTRY_BADGE[countryCode]
  return (
    <span
      aria-label={`Lokasjon: ${c.label}`}
      title={c.label}
      className="inline-flex items-center justify-center shrink-0 rounded font-semibold uppercase tabular-nums"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${c.bg} 88%, white), ${c.bg})`,
        color: c.fg,
        fontSize: size === 'sm' ? 8.5 : 10,
        lineHeight: 1,
        letterSpacing: '0.08em',
        padding: size === 'sm' ? '2px 4px' : '3px 5px',
        fontFamily: 'var(--font-body)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}
    >
      {c.label}
    </span>
  )
}
