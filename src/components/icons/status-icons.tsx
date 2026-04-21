type IconProps = {
  size?: number
  color?: string
  className?: string
}

// Status → icon mapping
export type EntryStatus = 'office' | 'remote' | 'customer' | 'travel' | 'vacation' | 'sick' | 'off'

// All icons are SF Symbol-style solid filled glyphs.
// `color` sets the primary fill. Small cutouts use evenodd fill-rule to
// punch holes in the glyph (like Apple SF Symbols filled variants).

// Kontor — Apartment building with 4 windows as cutouts
export function OfficeIcon({ size = 24, color = '#0066FF', className }: IconProps) {
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
export function RemoteIcon({ size = 24, color = '#16A362', className }: IconProps) {
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
export function CustomerIcon({ size = 24, color = '#FF7A1A', className }: IconProps) {
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

// Reise — Paper plane pointing up-right
export function TravelIcon({ size = 24, color = '#8B3FE6', className }: IconProps) {
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
export function VacationIcon({ size = 24, color = '#E8B400', className }: IconProps) {
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
export function SickIcon({ size = 24, color = '#E63946', className }: IconProps) {
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
export function OffDayIcon({ size = 24, color = '#78716C', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a.6.6 0 0 1 .64.83 7 7 0 0 0 9.23 9.23.6.6 0 0 1 .83.64Z"
        fill={color}
      />
    </svg>
  )
}

export const STATUS_COLORS: Record<EntryStatus, { bg: string; text: string; icon: string; bgDark: string; textDark: string }> = {
  office:   { bg: '#E8F1FE', text: '#0051D5', icon: '#0066FF', bgDark: '#0A1F3D', textDark: '#7FB2FF' },
  remote:   { bg: '#E8F7EE', text: '#0F7A3E', icon: '#16A362', bgDark: '#0A2E1A', textDark: '#6FD49A' },
  customer: { bg: '#FEF1E8', text: '#C04E00', icon: '#FF7A1A', bgDark: '#3D1F0A', textDark: '#FFB380' },
  travel:   { bg: '#F0E8FE', text: '#6B2ECB', icon: '#8B3FE6', bgDark: '#1F0A3D', textDark: '#C49AFF' },
  // Vacation uses a deeper amber so white text has safe contrast
  vacation: { bg: '#FEF9E8', text: '#7A5200', icon: '#D49000', bgDark: '#3D2E0A', textDark: '#FFDA7F' },
  sick:     { bg: '#FEE8EC', text: '#C41E3A', icon: '#E63946', bgDark: '#3D0A13', textDark: '#FF8A9E' },
  off:      { bg: '#F1F1EF', text: '#44403C', icon: '#78716C', bgDark: '#1C1917', textDark: '#A8A29E' },
}

export function StatusIcon({ status, size = 24, className, color: colorProp }: { status: EntryStatus; size?: number; className?: string; color?: string }) {
  const color = colorProp ?? STATUS_COLORS[status].icon
  switch (status) {
    case 'office':   return <OfficeIcon size={size} color={color} className={className} />
    case 'remote':   return <RemoteIcon size={size} color={color} className={className} />
    case 'customer': return <CustomerIcon size={size} color={color} className={className} />
    case 'travel':   return <TravelIcon size={size} color={color} className={className} />
    case 'vacation': return <VacationIcon size={size} color={color} className={className} />
    case 'sick':     return <SickIcon size={size} color={color} className={className} />
    case 'off':      return <OffDayIcon size={size} color={color} className={className} />
  }
}
