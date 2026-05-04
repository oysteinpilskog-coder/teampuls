'use client'

import { useDashboardMode } from '@/components/dashboard-mode-provider'

/** CalWin Light Blue (BrandBook §3) — RGB 101/195/238. Used as the
 *  uniform avatar tint when "CalWin-merket" dashboard mode is active so
 *  every member icon reads as part of the corporate identity. */
const CALWIN_LIGHT_BLUE = '#65C3EE'
const CALWIN_LIGHT_BLUE_HI = '#8AD3F2'
const CALWIN_LIGHT_BLUE_LO = '#3FA9DC'

function stringToHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

function getInitials(name: string, override?: string | null): string {
  if (override && override.trim()) return override.trim().toUpperCase()
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

const SIZE_MAP = {
  xs: { px: 20, text: '7px' },
  sm: { px: 28, text: '10px' },
  md: { px: 36, text: '12px' },
  lg: { px: 48, text: '15px' },
  xl: { px: 64, text: '20px' },
} as const

export type AvatarSize = keyof typeof SIZE_MAP

interface MemberAvatarProps {
  name: string
  initials?: string | null
  avatarUrl?: string | null
  size?: AvatarSize
  className?: string
}

export function MemberAvatar({
  name,
  initials,
  avatarUrl,
  size = 'sm',
  className = '',
}: MemberAvatarProps) {
  const { px, text } = SIZE_MAP[size]
  const { mode } = useDashboardMode()
  const isBrand = mode === 'brand'

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        width={px}
        height={px}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: px, height: px }}
      />
    )
  }

  // CalWin-merket: every initials avatar wears the brand Light Blue so the
  // entire app reads as a single corporate identity. Standard mode keeps
  // the per-name hashed gradient that gives each teammate a recognizable
  // tint at a glance.
  const hue = stringToHue(name)
  const hue2 = (hue + 35) % 360
  const background = isBrand
    ? `linear-gradient(135deg, ${CALWIN_LIGHT_BLUE_HI}, ${CALWIN_LIGHT_BLUE_LO})`
    : `linear-gradient(135deg, hsl(${hue}, 70%, 56%), hsl(${hue2}, 65%, 42%))`
  const boxShadow = isBrand
    ? `0 3px 10px -2px ${CALWIN_LIGHT_BLUE}66, inset 0 1px 0 rgba(255,255,255,0.25)`
    : `0 3px 10px -2px hsla(${hue}, 65%, 45%, 0.4), inset 0 1px 0 rgba(255,255,255,0.25)`

  return (
    <div
      className={`relative rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
      style={{
        width: px,
        height: px,
        background,
        fontSize: text,
        boxShadow,
        letterSpacing: '-0.02em',
      }}
      title={name}
      aria-label={name}
    >
      <span className="relative z-10">{getInitials(name, initials)}</span>
      {/* Glossy top highlight */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent 45%)',
        }}
      />
    </div>
  )
}

/** Horizontal stack of avatars with +N overflow chip */
interface AvatarStackProps {
  members: Array<{
    id: string
    display_name: string
    avatar_url: string | null
    initials?: string | null
    /** When true, the avatar renders dimmed with a dashed ring — signals that
     *  this presence is inferred from a default rather than registered. */
    assumed?: boolean
  }>
  max?: number
  size?: AvatarSize
}

export function AvatarStack({ members, max = 6, size = 'sm', ringColor }: AvatarStackProps & { ringColor?: string }) {
  const { px } = SIZE_MAP[size]
  const visible = members.slice(0, max)
  const overflow = members.length - max
  const ring = ringColor ?? 'rgba(255,255,255,0.8)'

  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div
          key={m.id}
          className="rounded-full"
          style={{
            marginLeft: i === 0 ? 0 : -(px * 0.35),
            boxShadow: m.assumed
              ? `0 0 0 1.5px ${ring}, 0 0 0 2.5px transparent`
              : `0 0 0 2px ${ring}`,
            outline: m.assumed ? `1.5px dashed rgba(161, 161, 170, 0.55)` : undefined,
            outlineOffset: m.assumed ? '-1px' : undefined,
            opacity: m.assumed ? 0.5 : 1,
          }}
          title={m.assumed ? `${m.display_name} — antatt` : m.display_name}
        >
          <MemberAvatar name={m.display_name} initials={m.initials} avatarUrl={m.avatar_url} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="rounded-full flex items-center justify-center font-semibold"
          style={{
            width: px,
            height: px,
            fontSize: SIZE_MAP[size].text,
            marginLeft: -(px * 0.35),
            background: 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(4px)',
            color: '#ffffff',
            textShadow: '0 1px 2px rgba(0,0,0,0.15)',
            boxShadow: `0 0 0 2px ${ring}`,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
