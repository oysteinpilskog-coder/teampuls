'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useTransition, useState, useEffect } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { no } from '@/lib/i18n/no'
import { spring } from '@/lib/motion'

const navLinks = [
  { href: '/', label: no.nav.home },
  { href: '/i-dag', label: no.nav.today },
  { href: '/min-plan', label: no.nav.myPlan },
  { href: '/wheel', label: no.nav.wheel },
  { href: '/dashboard', label: no.nav.dashboard },
  { href: '/settings', label: no.nav.settings },
]

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)

  // Drop optimistic target once the URL actually matches it
  useEffect(() => {
    if (optimisticHref && pathname === optimisticHref) setOptimisticHref(null)
  }, [pathname, optimisticHref])

  const activeHref = optimisticHref ?? pathname

  function handleNav(href: string, e: React.MouseEvent<HTMLAnchorElement>) {
    // let cmd/ctrl/middle-click fall through for new-tab behavior
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    if (href === pathname) return
    e.preventDefault()
    setOptimisticHref(href)
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <header className="sticky top-0 z-50">
      {/* Glass bar */}
      <div
        className="relative"
        style={{
          background: 'color-mix(in oklab, var(--bg-primary) 68%, transparent)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid color-mix(in oklab, var(--border-subtle) 60%, transparent)',
        }}
      >
        {/* Top progress shimmer — only visible during pending transition */}
        <motion.div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[2px] origin-left pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--accent-color), transparent)',
          }}
          animate={{
            opacity: isPending ? 1 : 0,
            scaleX: isPending ? [0.1, 0.9] : 0,
          }}
          transition={isPending
            ? { scaleX: { duration: 0.8, ease: 'easeOut' }, opacity: { duration: 0.1 } }
            : { duration: 0.2 }
          }
        />
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center gap-6">
          {/* Wordmark */}
          <Link
            href="/"
            onClick={(e) => handleNav('/', e)}
            className="flex items-center gap-2 shrink-0 select-none group"
          >
            {/* Mark — a gradient dot */}
            <motion.span
              className="relative block w-[22px] h-[22px] rounded-full"
              style={{
                background: 'conic-gradient(from 220deg, hsl(220,90%,62%), hsl(280,75%,62%), hsl(35,95%,60%), hsl(220,90%,62%))',
                boxShadow: '0 0 14px color-mix(in oklab, var(--accent-color) 55%, transparent)',
              }}
              whileHover={{ scale: 1.08, rotate: 20 }}
              transition={spring.snappy}
            >
              <span
                className="absolute inset-[3px] rounded-full"
                style={{ background: 'var(--bg-elevated)' }}
              />
            </motion.span>
            <span
              className="text-[17px] font-semibold tracking-tight"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sora)',
                letterSpacing: '-0.02em',
              }}
            >
              TeamPulse
            </span>
          </Link>

          {/* Nav with animated active pill */}
          <nav
            className="relative flex items-center gap-0.5 flex-1"
            aria-label="Hovednavigasjon"
          >
            {navLinks.map(({ href, label }) => {
              const isActive = activeHref === href
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={(e) => handleNav(href, e)}
                  className="relative px-4 py-1.5 text-[13px] font-medium transition-colors"
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: 'color-mix(in oklab, var(--bg-elevated) 85%, transparent)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px color-mix(in oklab, var(--border-subtle) 60%, transparent)',
                      }}
                      transition={spring.snappy}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}

// Renders the header only on non-auth pages
export function ConditionalHeader() {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/dashboard')
  if (isAuthPage) return null
  return <AppHeader />
}
