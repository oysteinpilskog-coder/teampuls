import { DEFAULT_HEX_COLORS } from '@/lib/status-colors/defaults'
import { derivePalettes } from '@/lib/status-colors/derive'

type IconProps = {
  size?: number
  color?: string
  className?: string
}

// Status → icon mapping
export type EntryStatus = 'office' | 'remote' | 'customer' | 'event' | 'travel' | 'vacation' | 'sick' | 'off'

// All icons are SF Symbol-style solid filled glyphs.
// `color` sets the primary fill. Small cutouts use evenodd fill-rule to
// punch holes in the glyph (like Apple SF Symbols filled variants).

// Kontor — Apartment building with 4 windows as cutouts
export function OfficeIcon({ size = 24, color = DEFAULT_HEX_COLORS.office, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 3.5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 3.5V20a1 1 0 0 1-1 1h-4v-4a2 2 0 0 0-4 0v4H6a1 1 0 0 1-1-1V3.5Zm3 3.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 8 8.25v-1.5Zm5.25-.75a.75.75 0 0 0-.75.75v1.5c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0-.75-.75h-1.5ZM8 11.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5Zm5.25-.75a.75.75 0 0 0-.75.75v1.5c0 .41.34.75.75.75h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0-.75-.75h-1.5Z"
        fill={color}
      />
    </svg>
  )
}

// Hjemmekontor — Solid house with chimney
export function RemoteIcon({ size = 24, color = DEFAULT_HEX_COLORS.remote, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.71 2.3a1 1 0 0 0-1.42 0l-9 9A1 1 0 0 0 3 13h1v7a1 1 0 0 0 1 1h4v-5.5a3 3 0 1 1 6 0V21h4a1 1 0 0 0 1-1v-7h1a1 1 0 0 0 .71-1.7l-3.21-3.22V3.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v2.09l-3.79-3.8Z"
        fill={color}
      />
    </svg>
  )
}

// Hos kunde — Two overlapping figures (partnership)
export function CustomerIcon({ size = 24, color = DEFAULT_HEX_COLORS.customer, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="7" r="3.5" fill={color} />
      <circle cx="16" cy="7" r="3.5" fill={color} />
      <path
        d="M2 19.5a6 6 0 0 1 11-3.37A6 6 0 0 1 22 19.5V21a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1.5Z"
        fill={color}
      />
    </svg>
  )
}

// Messe/konferanse/kurs — Megaphone angled upward
export function EventIcon({ size = 24, color = DEFAULT_HEX_COLORS.event, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20.3 3.12a1 1 0 0 0-1.45-.9L7.5 8.25H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h.6l.9 4.3A2 2 0 0 0 7.46 20h.82a1.5 1.5 0 0 0 1.47-1.8l-.77-3.88 9.87 4.78a1 1 0 0 0 1.45-.9V3.13Z"
        fill={color}
      />
    </svg>
  )
}

// Reise — Paper plane pointing up-right
export function TravelIcon({ size = 24, color = DEFAULT_HEX_COLORS.travel, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M21.37 2.14a1 1 0 0 1 .49 1.32l-8 18a1 1 0 0 1-1.84-.08l-2.86-7.55-7.54-2.86a1 1 0 0 1-.08-1.84l18-8a1 1 0 0 1 .83.01Z"
        fill={color}
      />
      <path
        d="m10.85 13.15 4.24-4.24"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Ferie — Sun with rays
export function VacationIcon({ size = 24, color = DEFAULT_HEX_COLORS.vacation, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="4.5" fill={color} />
      {/* 8 rays */}
      <g fill={color}>
        <rect x="11" y="1.5" width="2" height="4" rx="1" />
        <rect x="11" y="18.5" width="2" height="4" rx="1" />
        <rect x="1.5" y="11" width="4" height="2" rx="1" />
        <rect x="18.5" y="11" width="4" height="2" rx="1" />
        <rect x="11" y="1.5" width="2" height="4" rx="1" transform="rotate(45 12 12)" />
        <rect x="11" y="18.5" width="2" height="4" rx="1" transform="rotate(45 12 12)" />
        <rect x="1.5" y="11" width="4" height="2" rx="1" transform="rotate(45 12 12)" />
        <rect x="18.5" y="11" width="4" height="2" rx="1" transform="rotate(45 12 12)" />
      </g>
    </svg>
  )
}

// Syk — Solid thermometer
export function SickIcon({ size = 24, color = DEFAULT_HEX_COLORS.sick, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.5A3.5 3.5 0 0 0 8.5 5v8.82a5.5 5.5 0 1 0 7 0V5A3.5 3.5 0 0 0 12 1.5Zm0 4.5a1 1 0 0 1 1 1v8.28a2.5 2.5 0 1 1-2 0V7a1 1 0 0 1 1-1Z"
        fill={color}
      />
    </svg>
  )
}

// Fri — Solid crescent moon
export function OffDayIcon({ size = 24, color = DEFAULT_HEX_COLORS.off, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a.6.6 0 0 1 .64.83 7 7 0 0 0 9.23 9.23.6.6 0 0 1 .83.64Z"
        fill={color}
      />
    </svg>
  )
}

/**
 * Static default palette — derived from DEFAULT_HEX_COLORS.
 * Kept as a backwards-compatible export. For org-customizable colors,
 * prefer the `useStatusColors()` hook from `@/lib/status-colors/context`.
 */
const DEFAULT_PALETTES = derivePalettes(DEFAULT_HEX_COLORS)
export const STATUS_COLORS: Record<EntryStatus, { bg: string; text: string; icon: string; bgDark: string; textDark: string }> = {
  office:   { icon: DEFAULT_PALETTES.office.icon,   bg: DEFAULT_PALETTES.office.bg,   text: DEFAULT_PALETTES.office.text,   bgDark: DEFAULT_PALETTES.office.bgDark,   textDark: DEFAULT_PALETTES.office.textDark },
  remote:   { icon: DEFAULT_PALETTES.remote.icon,   bg: DEFAULT_PALETTES.remote.bg,   text: DEFAULT_PALETTES.remote.text,   bgDark: DEFAULT_PALETTES.remote.bgDark,   textDark: DEFAULT_PALETTES.remote.textDark },
  customer: { icon: DEFAULT_PALETTES.customer.icon, bg: DEFAULT_PALETTES.customer.bg, text: DEFAULT_PALETTES.customer.text, bgDark: DEFAULT_PALETTES.customer.bgDark, textDark: DEFAULT_PALETTES.customer.textDark },
  event:    { icon: DEFAULT_PALETTES.event.icon,    bg: DEFAULT_PALETTES.event.bg,    text: DEFAULT_PALETTES.event.text,    bgDark: DEFAULT_PALETTES.event.bgDark,    textDark: DEFAULT_PALETTES.event.textDark },
  travel:   { icon: DEFAULT_PALETTES.travel.icon,   bg: DEFAULT_PALETTES.travel.bg,   text: DEFAULT_PALETTES.travel.text,   bgDark: DEFAULT_PALETTES.travel.bgDark,   textDark: DEFAULT_PALETTES.travel.textDark },
  vacation: { icon: DEFAULT_PALETTES.vacation.icon, bg: DEFAULT_PALETTES.vacation.bg, text: DEFAULT_PALETTES.vacation.text, bgDark: DEFAULT_PALETTES.vacation.bgDark, textDark: DEFAULT_PALETTES.vacation.textDark },
  sick:     { icon: DEFAULT_PALETTES.sick.icon,     bg: DEFAULT_PALETTES.sick.bg,     text: DEFAULT_PALETTES.sick.text,     bgDark: DEFAULT_PALETTES.sick.bgDark,     textDark: DEFAULT_PALETTES.sick.textDark },
  off:      { icon: DEFAULT_PALETTES.off.icon,      bg: DEFAULT_PALETTES.off.bg,      text: DEFAULT_PALETTES.off.text,      bgDark: DEFAULT_PALETTES.off.bgDark,      textDark: DEFAULT_PALETTES.off.textDark },
}

export function StatusIcon({ status, size = 24, className, color: colorProp }: { status: EntryStatus; size?: number; className?: string; color?: string }) {
  const color = colorProp ?? STATUS_COLORS[status].icon
  switch (status) {
    case 'office':   return <OfficeIcon size={size} color={color} className={className} />
    case 'remote':   return <RemoteIcon size={size} color={color} className={className} />
    case 'customer': return <CustomerIcon size={size} color={color} className={className} />
    case 'event':    return <EventIcon size={size} color={color} className={className} />
    case 'travel':   return <TravelIcon size={size} color={color} className={className} />
    case 'vacation': return <VacationIcon size={size} color={color} className={className} />
    case 'sick':     return <SickIcon size={size} color={color} className={className} />
    case 'off':      return <OffDayIcon size={size} color={color} className={className} />
  }
}
