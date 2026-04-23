'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OffiviewWordmark } from '@/components/brand/offiview-wordmark'
import { useT } from '@/lib/i18n/context'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(t.auth.error)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo / Wordmark */}
        <div
          className="mb-12 flex flex-col items-center text-center"
          style={{ color: 'var(--text-primary)' }}
        >
          <OffiviewWordmark size={36} variant="ink" title={t.app.name} />
          <p
            className="mt-5 text-[18px]"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontVariationSettings: '"opsz" 24, "SOFT" 80',
              color: 'var(--text-secondary)',
              letterSpacing: '-0.015em',
            }}
          >
            {t.app.tagline}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border border-[var(--border-subtle)] p-8"
          style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-lg)' }}
        >
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#E8F7EE] flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#16A362" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[15px] font-medium text-[var(--text-primary)]">
                {t.auth.magicLinkSent}
              </p>
              <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">{email}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2"
                >
                  {t.auth.emailLabel}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.auth.emailPlaceholder}
                  required
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all focus:outline-none focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20"
                />
              </div>

              {error && (
                <p className="text-[13px] text-[#E63946]">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full h-12 rounded-xl text-[15px] font-medium text-white transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: loading
                    ? 'color-mix(in oklab, var(--accent-color) 70%, transparent)'
                    : 'var(--accent-color)',
                  boxShadow: loading ? 'none' : 'var(--shadow-accent)',
                }}
              >
                {loading ? t.auth.sending : t.auth.magicLinkButton}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
