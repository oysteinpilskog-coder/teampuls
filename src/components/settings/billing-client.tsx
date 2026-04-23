'use client'

import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Check, Sparkles, ArrowUpRight, Users, Zap, Shield, Globe2, Infinity as InfinityIcon } from 'lucide-react'
import { toast } from 'sonner'
import { spring } from '@/lib/motion'
import { useHaptic } from '@/hooks/use-haptic'

type PlanId = 'free' | 'team' | 'enterprise'
type Billing = 'monthly' | 'yearly'
type Currency = 'NOK' | 'EUR' | 'USD'

interface Plan {
  id: PlanId
  name: string
  tagline: string
  /** Per-seat price. Enterprise uses `null` → "Kontakt oss". */
  price: Record<Currency, { monthly: number; yearly: number } | null>
  seatsIncluded: number | null
  featured?: boolean
  features: Array<{ icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string }>
  ctaLabel: (currentId: PlanId) => string
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For team som akkurat er i gang.',
    price: {
      NOK: { monthly: 0, yearly: 0 },
      EUR: { monthly: 0, yearly: 0 },
      USD: { monthly: 0, yearly: 0 },
    },
    seatsIncluded: 5,
    features: [
      { icon: Users, label: 'Inntil 5 medlemmer' },
      { icon: Zap,   label: 'AI-input med 100 kall/mnd' },
      { icon: Globe2, label: 'Lese-tilgang for gjester' },
    ],
    ctaLabel: (curr) => (curr === 'free' ? 'Nåværende plan' : 'Degrader til Free'),
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For moderne team som koordinerer hver dag.',
    price: {
      NOK: { monthly: 89, yearly: 79 },
      EUR: { monthly: 8,  yearly: 7 },
      USD: { monthly: 9,  yearly: 8 },
    },
    seatsIncluded: null,
    featured: true,
    features: [
      { icon: Users,   label: 'Ubegrenset antall medlemmer' },
      { icon: Zap,     label: 'AI-input + AI-spørsmål uten tak' },
      { icon: Sparkles,label: 'AI-foreslåtte samlingsdager' },
      { icon: Globe2,  label: 'Workspaces, Årshjul, Dashboard' },
      { icon: Shield,  label: 'Prioritert støtte' },
    ],
    ctaLabel: (curr) => (curr === 'team' ? 'Nåværende plan' : curr === 'free' ? 'Oppgrader til Team' : 'Bytt til Team'),
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'SAML, audit-logger og dedikert support.',
    price: {
      NOK: null,
      EUR: null,
      USD: null,
    },
    seatsIncluded: null,
    features: [
      { icon: Shield,     label: 'SAML / SSO, SCIM-provisioning' },
      { icon: InfinityIcon, label: 'Egen Supabase-region' },
      { icon: Users,      label: 'Dedikert customer success-kontakt' },
      { icon: Globe2,     label: 'Data residency etter ønske' },
    ],
    ctaLabel: () => 'Kontakt salg',
  },
]

const CURRENCY_LABEL: Record<Currency, string> = { NOK: 'kr', EUR: '€', USD: '$' }

interface BillingClientProps {
  orgName: string
  createdAt: string | null
  currentPlanId: string
  seatsUsed: number
}

export function BillingClient({ orgName, createdAt, currentPlanId, seatsUsed }: BillingClientProps) {
  const [billing, setBilling] = useState<Billing>('yearly')
  const [currency, setCurrency] = useState<Currency>('NOK')
  const haptic = useHaptic()

  const plan = useMemo(
    () => PLANS.find((p) => p.id === currentPlanId) ?? PLANS[0],
    [currentPlanId],
  )

  function handleSelect(id: PlanId) {
    haptic('medium')
    if (id === 'enterprise') {
      // Deep-link to mail client — swap for a real contact form when ready.
      window.location.href = `mailto:sales@teampuls.no?subject=TeamPulse%20Enterprise%20for%20${encodeURIComponent(orgName)}`
      return
    }
    if (id === currentPlanId) {
      toast.info('Du er allerede på denne planen.')
      return
    }
    // No commerce wiring yet — surface a friendly message + capture intent
    // in a toast. We'll plug this into Stripe in a follow-up.
    toast.success(`Forespørsel om å bytte til ${id} er notert. Vi hører fra deg snart.`)
  }

  const memberOfDays = createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <div className="space-y-8">
      {/* Header — current plan card + seat usage */}
      <section
        className="relative rounded-2xl p-6 overflow-hidden"
        style={{
          background:
            'linear-gradient(160deg, color-mix(in oklab, var(--accent-color) 12%, var(--lg-surface-1, var(--bg-elevated))) 0%, var(--lg-surface-1, var(--bg-elevated)) 60%)',
          border: '1px solid color-mix(in oklab, var(--accent-color) 22%, transparent)',
          boxShadow:
            '0 24px 48px -16px color-mix(in oklab, var(--accent-color) 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      >
        <div
          aria-hidden
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in oklab, var(--accent-color) 30%, transparent), transparent 70%)',
            filter: 'blur(36px)',
          }}
        />
        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1.5"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              Nåværende plan
            </div>
            <div className="flex items-baseline gap-3">
              <h2
                className="font-bold leading-none"
                style={{
                  fontFamily: 'var(--font-sora)',
                  color: 'var(--text-primary)',
                  fontSize: 'clamp(28px, 4vw, 40px)',
                  letterSpacing: '-0.035em',
                }}
              >
                {plan.name}
              </h2>
              {plan.featured && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))',
                    color: '#fff',
                    boxShadow: '0 4px 10px color-mix(in oklab, var(--accent-color) 35%, transparent)',
                  }}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Anbefalt
                </span>
              )}
            </div>
            <p
              className="mt-1 text-[14px]"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
            >
              {plan.tagline}
            </p>
          </div>

          <SeatUsage used={seatsUsed} limit={plan.seatsIncluded} />
        </div>

        {memberOfDays !== null && (
          <div
            className="relative mt-5 text-[11.5px] font-medium"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            {orgName} har brukt TeamPulse i {memberOfDays} dager.
          </div>
        )}
      </section>

      {/* Billing + currency toggles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Toggle
          value={billing}
          onChange={(v) => { haptic('light'); setBilling(v as Billing) }}
          options={[
            { value: 'monthly', label: 'Månedlig' },
            { value: 'yearly', label: 'Årlig', badge: '-20%' },
          ]}
        />
        <Toggle
          value={currency}
          onChange={(v) => { haptic('light'); setCurrency(v as Currency) }}
          options={[
            { value: 'NOK', label: 'NOK' },
            { value: 'EUR', label: 'EUR' },
            { value: 'USD', label: 'USD' },
          ]}
          compact
        />
      </div>

      {/* Plan cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <PlanCard
            key={p.id}
            plan={p}
            index={i}
            billing={billing}
            currency={currency}
            isCurrent={p.id === currentPlanId}
            onSelect={() => handleSelect(p.id)}
          />
        ))}
      </div>

      {/* Invoices — mocked row so the surface doesn't feel empty pre-commerce */}
      <section>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          Fakturahistorikk
        </div>
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
            border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
          }}
        >
          <div
            className="text-[13px] text-center py-10"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Ingen fakturaer ennå.
          </div>
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function SeatUsage({ used, limit }: { used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const over = limit ? used > limit : false
  return (
    <div className="shrink-0 min-w-[200px]">
      <div
        className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1"
        style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
      >
        Plasser
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-bold tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-sora)',
            color: over ? '#EF4444' : 'var(--text-primary)',
            fontSize: 28,
            letterSpacing: '-0.03em',
          }}
        >
          {used}
        </span>
        <span
          className="text-[13px] font-medium tabular-nums"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          / {limit ?? '∞'}
        </span>
      </div>
      {limit !== null && (
        <div
          className="mt-2 h-1.5 rounded-full overflow-hidden"
          style={{ background: 'color-mix(in oklab, var(--bg-subtle) 80%, transparent)' }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="h-full rounded-full"
            style={{
              background: over
                ? 'linear-gradient(90deg, #F59E0B, #EF4444)'
                : 'linear-gradient(90deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, #8b3fe6))',
              boxShadow: over
                ? '0 0 10px rgba(239,68,68,0.45)'
                : '0 0 10px color-mix(in oklab, var(--accent-color) 45%, transparent)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  index,
  billing,
  currency,
  isCurrent,
  onSelect,
}: {
  plan: Plan
  index: number
  billing: Billing
  currency: Currency
  isCurrent: boolean
  onSelect: () => void
}) {
  const priceRow = plan.price[currency]
  const perSeat = priceRow ? priceRow[billing] : null

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay: 0.04 + index * 0.06 }}
      className="relative rounded-2xl p-6 flex flex-col"
      style={{
        background: plan.featured
          ? 'linear-gradient(165deg, color-mix(in oklab, var(--accent-color) 14%, var(--bg-elevated)) 0%, var(--bg-elevated) 65%)'
          : 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
        border: plan.featured
          ? '1px solid color-mix(in oklab, var(--accent-color) 35%, transparent)'
          : '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
        boxShadow: plan.featured
          ? '0 24px 48px -16px color-mix(in oklab, var(--accent-color) 32%, transparent), 0 8px 16px -12px rgba(10,20,40,0.14), inset 0 1px 0 rgba(255,255,255,0.5)'
          : '0 10px 24px -16px rgba(10,20,40,0.14), 0 1px 2px rgba(10,20,40,0.04), inset 0 1px 0 rgba(255,255,255,0.45)',
        minHeight: 460,
      }}
    >
      {plan.featured && (
        <div
          className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))',
            color: '#fff',
            boxShadow: '0 4px 10px color-mix(in oklab, var(--accent-color) 35%, transparent)',
          }}
        >
          <Sparkles className="w-2.5 h-2.5" />
          Mest populær
        </div>
      )}

      <h3
        className="font-bold leading-none"
        style={{
          fontFamily: 'var(--font-sora)',
          color: 'var(--text-primary)',
          fontSize: 24,
          letterSpacing: '-0.03em',
        }}
      >
        {plan.name}
      </h3>
      <p
        className="mt-1.5 text-[13px]"
        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
      >
        {plan.tagline}
      </p>

      <div className="mt-5 mb-5">
        {perSeat === null ? (
          <div>
            <div
              className="font-bold leading-none"
              style={{
                fontFamily: 'var(--font-sora)',
                color: 'var(--text-primary)',
                fontSize: 32,
                letterSpacing: '-0.03em',
              }}
            >
              Kontakt oss
            </div>
            <div
              className="mt-1 text-[11.5px]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              Tilpasset hver organisasjon
            </div>
          </div>
        ) : perSeat === 0 ? (
          <div>
            <div
              className="font-bold leading-none"
              style={{
                fontFamily: 'var(--font-sora)',
                color: 'var(--text-primary)',
                fontSize: 32,
                letterSpacing: '-0.03em',
              }}
            >
              Gratis
            </div>
            <div
              className="mt-1 text-[11.5px]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              For alltid
            </div>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-bold tabular-nums leading-none"
              style={{
                fontFamily: 'var(--font-sora)',
                color: 'var(--text-primary)',
                fontSize: 40,
                letterSpacing: '-0.04em',
              }}
            >
              {CURRENCY_LABEL[currency] === '€' || CURRENCY_LABEL[currency] === '$'
                ? `${CURRENCY_LABEL[currency]}${perSeat}`
                : `${perSeat}`}
            </span>
            {CURRENCY_LABEL[currency] !== '€' && CURRENCY_LABEL[currency] !== '$' && (
              <span
                className="text-[14px] font-semibold"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
              >
                {CURRENCY_LABEL[currency]}
              </span>
            )}
            <span
              className="text-[12px]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              / plass / mnd{billing === 'yearly' ? ', årlig' : ''}
            </span>
          </div>
        )}
      </div>

      <ul className="space-y-2 flex-1">
        {plan.features.map((f, i) => {
          const Icon = f.icon
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13px]"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              <Icon
                className="w-3.5 h-3.5 mt-[3px] shrink-0"
                strokeWidth={1.8}
              />
              <span>{f.label}</span>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        disabled={isCurrent}
        className="mt-6 inline-flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60 disabled:cursor-default hover:-translate-y-px"
        style={{
          background: isCurrent
            ? 'color-mix(in oklab, var(--bg-subtle) 70%, transparent)'
            : plan.featured
              ? 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))'
              : 'color-mix(in oklab, var(--bg-subtle) 70%, transparent)',
          color: isCurrent
            ? 'var(--text-tertiary)'
            : plan.featured
              ? '#fff'
              : 'var(--text-primary)',
          border: plan.featured ? 'none' : '1px solid color-mix(in oklab, var(--border-subtle) 70%, transparent)',
          boxShadow: plan.featured && !isCurrent
            ? '0 8px 20px -6px color-mix(in oklab, var(--accent-color) 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)'
            : 'none',
          fontFamily: 'var(--font-body)',
        }}
      >
        {isCurrent && <Check className="w-4 h-4" strokeWidth={2.2} />}
        {plan.ctaLabel(plan.id === 'free' ? 'free' : plan.id) /* passes plan's own id since we check via disabled */}
        {!isCurrent && plan.id === 'enterprise' && <ArrowUpRight className="w-3.5 h-3.5" />}
      </button>
    </motion.article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
  options,
  compact,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; badge?: string }>
  compact?: boolean
}) {
  return (
    <div
      className="inline-flex items-center p-1 rounded-full"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 70%, transparent)',
        backdropFilter: 'blur(14px) saturate(180%)',
        WebkitBackdropFilter: 'blur(14px) saturate(180%)',
        border: '1px solid color-mix(in oklab, var(--border-subtle) 55%, transparent)',
      }}
    >
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative px-${compact ? '3' : '4'} h-8 rounded-full text-[12.5px] font-semibold transition-colors focus:outline-none`}
            style={{
              color: active ? '#fff' : 'var(--text-secondary)',
              background: active
                ? 'linear-gradient(135deg, var(--accent-color), color-mix(in oklab, var(--accent-color) 70%, black))'
                : 'transparent',
              boxShadow: active
                ? '0 4px 12px color-mix(in oklab, var(--accent-color) 30%, transparent)'
                : 'none',
              fontFamily: 'var(--font-body)',
            }}
          >
            {o.label}
            {o.badge && (
              <span
                className="ml-1.5 text-[9px] font-bold uppercase tracking-[0.12em]"
                style={{ color: active ? 'rgba(255,255,255,0.8)' : '#10B981' }}
              >
                {o.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
