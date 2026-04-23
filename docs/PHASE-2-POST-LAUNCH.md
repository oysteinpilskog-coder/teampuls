# Fase 2 — Rett etter lansering (0–3 måneder) ⚡

Mål: Redusere friksjon, øke aktivering, bygg inn observabilitet for vekst.

---

## 2.1 Onboarding & aktivering ⚡

- [ ] Onboarding-wizard første gang admin logger inn:
  - [ ] Sett workspace-navn, timezone, uke-start
  - [ ] Inviter teamet (batch email-input)
  - [ ] Legg til første kontor
  - [ ] Legg til en testoppføring via AI
- [ ] Tomstate-illustrasjoner med CTA
- [ ] Tooltip-tour (intro.js eller Shepherd) på hovedvisning første besøk
- [ ] Progress-indikator: "3 av 5 steg fullført"
- [ ] "Inviter teamet"-prompt hvis < 3 medlemmer etter 3 dager

## 2.2 Analytics ⚡

- [ ] **PostHog** (selv-hostet eller cloud)
  - [ ] Events: signup, activated, entry_created, ai_parse, workspace_switched, invite_sent, subscription_upgraded, churned
  - [ ] Funnels: signup → first-entry → invited-team → paid
  - [ ] Session recordings (anonymisert)
  - [ ] Feature flags (for gradvis rollout)
- [ ] Plausible eller Fathom for public marketing-site (ikke app)
- [ ] Stripe Revenue Dashboard / ChartMogul for MRR

## 2.3 Outbound-email utvidet ⚡

- [ ] **Weekly digest** (opt-in):
  - [ ] Hvem er på kontor denne uken
  - [ ] Kommende events
  - [ ] Foreslåtte "alle sammen"-dager
- [ ] **Daglig reminder** (opt-in): "Husk å oppdatere planen din"
- [ ] **Kunde-besøk-oppsummering** sendt til kontoadmin
- [ ] **Milepæl-email**: 1 uke, 1 måned, 3 måneder aktiv
- [ ] Email-preferanser-side i settings

## 2.4 In-app support 📌

- [ ] Velg verktøy: **Crisp** (gratis tier OK) eller Intercom
- [ ] Chat-widget (kun innlogget)
- [ ] Hjelpesenter (Notion public eller HelpScout Docs)
- [ ] Feedback-knapp med skjermbilde-capture
- [ ] Changelog-side + in-app "Hva er nytt" popover

## 2.5 Admin-dashboard 📌

Intern admin-side (ikke for sluttbrukere):

- [ ] Beskyttet bak `role=superadmin` (ny kolonne på auth.users eller egen tabell)
- [ ] Liste over accounts med MRR, bruk, siste aktivitet
- [ ] Impersonate bruker (GDPR-logget)
- [ ] Manuell plan-override
- [ ] AI-usage per org (kostnader)
- [ ] Churn-risk-signaler (inaktive 14+ dager)

## 2.6 Varsler in-app ⚡

- [ ] Notifikasjoner-tabell i DB
- [ ] Bjelle-ikon i header med unread-count
- [ ] Typer:
  - [ ] "X inviterte deg til Y"
  - [ ] "X oppdaterte planen neste uke"
  - [ ] "Ny kommentar på din entry"
  - [ ] "AI kunne ikke tolke meldingen din"
- [ ] Mark all as read
- [ ] Email-fallback etter 24t ulest

## 2.7 Bedre feilopplevelse 📌

- [ ] Global ErrorBoundary med pent feilbilde + "send rapport"
- [ ] Retry-knapp på nettverksfeil
- [ ] Offline-detektor med banner
- [ ] Optimistic updates med rollback-feedback
- [ ] Empty states med handlings-CTA (ikke bare tekst)

## 2.8 Kommentarer / notater på entries 📌

- [ ] Textarea på cell-editor (fritekst-notat)
- [ ] Vis notat som tooltip på hover
- [ ] Søk i notater
- [ ] @-mention team-medlemmer (for fase 3)

## 2.9 Ytelse & skalering 📌

- [ ] Database: analyzer + legg indexer der EXPLAIN viser seq scan
- [ ] Edge caching for statiske API-responses
- [ ] Lazy-load tunge komponenter (Year Wheel, Europe Map)
- [ ] Code splitting per rute verifisert
- [ ] Prefetch neste workspace ved hover
- [ ] Bundle < 150KB gz på hovedsidene

## 2.10 Mobilforbedringer 📌

- [ ] PWA manifest + service worker (offline-basic)
- [ ] Home screen install-prompt
- [ ] Mobil-optimalisert cell-editor (full-screen sheet)
- [ ] Swipe-gestures mellom uker
- [ ] Touch-targets ≥ 44px
- [ ] Test på ekte enheter (iPhone SE og nedover)

## 2.11 Tilgjengelighet (a11y) 📌

- [ ] Axe-scan i CI
- [ ] Keyboard-nav på Team Grid (piltaster)
- [ ] Screen-reader-test (VoiceOver, NVDA)
- [ ] Focus-trap i modaler
- [ ] Alt-tekst på alle bilder/ikoner med mening
- [ ] Fargekontrast verifisert (WCAG AA)
- [ ] Prefers-reduced-motion respektert (Framer Motion)

## 2.12 SEO + marketing-site 📌

- [ ] Egen landingsside (kan være egen Next.js-rute eller Astro)
- [ ] Metadata per rute (title, description, OG)
- [ ] Structured data (Organization, WebApplication)
- [ ] Blog (MDX) for content marketing
- [ ] Case studies / testimonials
- [ ] Pricing-side med Stripe Pricing Table

## 2.13 Billing-forbedringer ⚡

- [ ] Annual billing med 2 måneder gratis
- [ ] Upgrade/downgrade-flyt polish
- [ ] Proration-varsel før trekk
- [ ] "Avslutt abonnement"-exit-intervju
- [ ] Reactivate-flyt for cancelled
- [ ] Kupong-koder / rabatter
- [ ] Tax ID for bedriftskunder

---

## KPI-er å følge

- Aktiveringsrate: signup → 5 entries innen 7 dager
- Team-adopsjon: invitert → første entry
- Weekly active orgs (WAO)
- MRR + netto churn
- AI-parse success rate (≥ 0.7 confidence)
- Support-tickets per aktiv bruker
- p95 sideresponstid
- Error-rate (Sentry)
