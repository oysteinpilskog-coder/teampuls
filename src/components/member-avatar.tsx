'use client'

function stringToHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

function getInitials(name: string): string {
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
  avatarUrl?: string | null
  size?: AvatarSize
  className?: string
}

export function MemberAvatar({
  name,
  avatarUrl,
  size = 'sm',
  className = '',
}: MemberAvatarProps) {
  const { px, text } = SIZE_MAP[size]
  const hue = stringToHue(name)

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

  const hue2 = (hue + 35) % 360
  return (
    <div
      className={`relative rounded-full flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
      style={{
        width: px,
        height: px,
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 56%), hsl(${hue2}, 65%, 42%))`,
        fontSize: text,
        boxShadow: `0 3px 10px -2px hsla(${hue}, 65%, 45%, 0.4), inset 0 1px 0 rgba(255,255,255,0.25)`,
        letterSpacing: '-0.02em',
      }}
      title={name}
      aria-label={name}
    >
      <span className="relative z-10">{getInitials(name)}</span>
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
  members: Array<{ id: string; display_name: string; avatar_url: string | null }>
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
            boxShadow: `0 0 0 2px ${ring}`,
          }}
          title={m.display_name}
        >
          <MemberAvatar name={m.display_name} avatarUrl={m.avatar_url} size={size} />
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
