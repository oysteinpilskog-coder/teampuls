import type { WorkspaceSummary } from '@/lib/supabase/types'

function safeHex(value: string | null | undefined): string | null {
  if (!value) return null
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null
}

/**
 * Liten pille som markerer hvilket arbeidsområde en rad tilhører.
 * Vises kun i «Alle CalWin»-vyene (settings/members, /offices, /customers,
 * /welcome), så admin kan skille Nordic-rader fra UK-rader på et blikk.
 *
 * Bruker workspace.accent_color hvis satt — ellers en nøytral grå pille.
 */
export function WorkspaceBadge({
  workspace,
  size = 'sm',
}: {
  workspace: Pick<WorkspaceSummary, 'name' | 'short_name' | 'accent_color'> | null
  size?: 'xs' | 'sm'
}) {
  if (!workspace) return null
  const label = workspace.short_name || workspace.name.slice(0, 3).toUpperCase()
  const accent = safeHex(workspace.accent_color)
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
  return (
    <span
      className={`inline-flex items-center ${px} rounded-md font-semibold uppercase tracking-[0.12em] shrink-0`}
      style={{
        backgroundColor: accent
          ? `color-mix(in oklab, ${accent} 12%, transparent)`
          : 'var(--bg-subtle)',
        color: accent ?? 'var(--text-secondary)',
        border: `1px solid ${accent ? `color-mix(in oklab, ${accent} 28%, transparent)` : 'var(--border-subtle)'}`,
        fontFamily: 'var(--font-body)',
      }}
      title={workspace.name}
      aria-label={`Arbeidsområde: ${workspace.name}`}
    >
      {label}
    </span>
  )
}
