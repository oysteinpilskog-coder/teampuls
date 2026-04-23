# TeamPulse — Teknisk audit

**Dato:** 2026-04-23
**Versjon:** v0.1.0
**Stack:** Next.js 16.2 / React 19.2 / Supabase / Anthropic Claude / Tailwind 4

---

## 1. Scorecards

| Område | Score | Kommentar |
|--------|-------|-----------|
| Kodekvalitet | 7/10 | Strict TS, rene mønstre, ingen linting/tester |
| Funksjonsdekning | 5/10 | Kjerneflyt solid, billing/analytics/observability mangler |
| Sikkerhet | 7/10 | RLS solid, input-validering svak, ingen rate-limit |
| UX/Design | 9/10 | Liquid Glass, animasjoner, norsk-først, flott |
| DevOps | 3/10 | Ingen CI/CD, ingen observability, manuell deploy |
| **Samlet** | **6/10** | Sterkt fundament, ikke klar for betalende kunder |

Estimat til produksjonsklar: **4–5 uker** (ekskl. ny funksjonalitet).

---

## 2. Hva er solid og ferdig ✅

### Arkitektur & stack
- [x] Next.js 16 App Router med riktig RSC/Client split
- [x] React 19 + strict TypeScript (`strict: true`, ingen `any`)
- [x] Supabase SSR (browser + server + admin-klient separert)
- [x] Tailwind 4 + shadcn/ui + Framer Motion
- [x] Path-alias `@/*` → `src/*`
- [x] `date-fns` (ikke moment.js-bloat)

### Datamodell & multi-tenancy
- [x] To-nivå tenant-modell: `accounts` → `organizations` → `members`
- [x] Bruker kan ha N workspaces, aktiv workspace i cookie
- [x] Workspace-switcher med ⌘1–⌘9 snarveier
- [x] RLS på alle tabeller (`org_id = ANY(current_user_org_ids())`)
- [x] Admin/member rollemodell med dedikerte policies
- [x] Storage bucket for logoer med path-scoped policies
- [x] 11 migrasjoner, ryddig historikk

### Autentisering
- [x] Magic link (OTP) via Supabase
- [x] Auto-linking av member på første innlogging (email-match)
- [x] SSR-session med cookies

### Kalenderfunksjoner
- [x] 4 visninger: Team Grid (ukematrise), My Plan (år), Dashboard (carousel), Year Wheel
- [x] 7 statuser: office, remote, customer, travel, vacation, sick, off
- [x] Realtime-oppdateringer (Supabase channels i `use-entries.ts`)
- [x] Drag/resize av datoområder med optimistic updates
- [x] Inline cell-editor + event-editor
- [x] Presence heatmap (30 dager)
- [x] Year Wheel (Plandisc-stil)
- [x] Company events (helligdager, møter, deadlines)

### AI-parsing
- [x] Claude 3.5 Sonnet integrasjon for naturlig språk → entries
- [x] System prompt cached (ephemeral) med medlemsliste + customer registry
- [x] Konfidensbasert avvisning (< 0.7 → be om avklaring)
- [x] Audit trail i `ai_messages`-tabellen
- [x] Email-inbound via CloudMailin-webhook med token-validering
- [x] Web-UI input med toast-feedback

### UX & design
- [x] Fullstendig norsk lokalisering (`src/lib/i18n/no.ts`, 250+ strenger)
- [x] Dark/light mode med `next-themes`
- [x] Liquid Glass estetikk + aurora-bakgrunn
- [x] Command palette (⌘K)
- [x] Hurtigtaster + hjelpepanel (⌘?)
- [x] Haptic feedback på mobil (Vibration API)
- [x] Empty states med animasjon
- [x] Hover cards for medlemmer
- [x] Inactivity nudge (påminnelse ved 5+ dager uten entry)
- [x] Loading states per rute (`loading.tsx`)

### Admin-funksjoner
- [x] Org-innstillinger: navn, timezone, farger, logo-upload (5MB, whitelist)
- [x] Medlemshåndtering (legg til/fjern/role)
- [x] Office-registry med geolokasjon
- [x] Customer-registry med aliaser for AI-matching
- [x] Custom status-farger per org

### Integrasjoner som funker
- [x] Supabase Auth + Realtime
- [x] Anthropic Claude SDK
- [x] CloudMailin (inbound email)
- [x] Nominatim (reverse geocoding)

---

## 3. Hva mangler kritisk ❌

| # | Mangel | Konsekvens | Fase |
|---|--------|------------|------|
| 1 | Billing (Stripe) + plan-enforcement | Ingen inntekt, ubegrenset API-kost | 🔥 1 |
| 2 | Ingen tester (0 filer) | Regresjoner ved hver deploy | 🔥 1 |
| 3 | Ingen error tracking (Sentry) | Feil oppdages av brukere | 🔥 1 |
| 4 | Ingen rate limiting | Claude-regning ukontrollert | 🔥 1 |
| 5 | Ingen input-validering (Zod) | API-endepunkter stoler blindt | 🔥 1 |
| 6 | Ingen linting/formatering | Inkonsistent kodebase | ⚡ 1 |
| 7 | Ingen CI/CD | Manuell deploy, ingen gates | ⚡ 1 |
| 8 | `.env.example` mangler | Onboarding tar timer | ⚡ 1 |
| 9 | Ingen self-serve signup | Admin må lage medlem først | 🔥 1 |
| 10 | Ingen GDPR/ToS/Privacy | Ulovlig i EU | 🔥 1 |
| 11 | Ingen CSP/CORS-headers | XSS-risiko | ⚡ 1 |
| 12 | Ingen outbound email | Kan ikke varsle brukere | 📌 2 |
| 13 | Ingen analytics | Blind drift | 📌 2 |
| 14 | Ingen Google/Outlook Calendar-sync | Friksjon for bedrifter | 📌 3 |
| 15 | Ingen engelsk/nordisk i18n | Begrenset TAM | 💤 4 |

---

## 4. Mellomstore funn 🟡

- **Filer som bør ryddes**: `src/proxy.ts` er udokumentert og ser legacy ut.
- **`console.log` i produksjonspath** (`/api/ai/parse`, `/api/email-inbound`) — erstatt med strukturert logger.
- **Bundle**: Ingen bundle-analyzer, sannsynligvis 150–200 KB gz. Framer Motion + d3-geo er tyngst.
- **`next/image` ikke brukt** — logoer lastes som-er.
- **Ingen explicit DB-indexer** i migrasjoner (Supabase auto-indexer FK, men søk på `entries(org_id, member_id, date)` bør verifiseres).
- **Dato-formatering** bruker `date-fns` uten locale — faller til en-US.

---

## 5. Sikkerhetsfunn detaljert

| Funn | Alvorlighet | Fix |
|------|-------------|-----|
| `/api/ai/parse` bruker admin-klient uten å sjekke caller-identity mot member_id | HØY | Verifiser session.member_id == target member, eller admin |
| CloudMailin-token i querystring (loggbar i access logs) | MEDIUM | Flytt til header + timing-safe compare |
| Filnavn ikke sanitert ved upload | LAV | Beholder `Date.now()` + ext, ok i praksis |
| Ingen CSP-header | MEDIUM | Legg til i `next.config.ts` headers() |
| Ingen rate-limit på AI | HØY | Middleware + Upstash Redis eller Supabase KV |
| Anonym Supabase-nøkkel eksponert | OK | By design — RLS er grensen |

---

## 6. Anbefalt rekkefølge (4–5 uker)

### Uke 1: Sikkerhet + observability
- Sentry + strukturert logging
- Rate-limiting (Upstash)
- Zod input-validering
- CSP + security headers
- `.env.example`

### Uke 2: Billing + signup
- Stripe Checkout + Customer Portal
- Plan-enforcement middleware
- Self-serve signup flow
- Team-invite via email

### Uke 3: Testing + CI/CD
- Vitest + Playwright oppsett
- Kritiske tester (auth, AI-parse, RLS)
- GitHub Actions (lint, type, test, build)
- Preview deployments

### Uke 4: Juridisk + launch-prep
- Personvernerklæring, ToS, DPA
- GDPR: data-eksport + sletting
- Support-kanal (email + Crisp/Intercom)
- Uptime-monitor
- Backup-verifisering

### Uke 5: UAT + polish
- UAT med 5–10 testbrukere
- Fiks blokkere
- Produksjonsmiljø + domene + SSL
- Launch 🚀

---

Se [`PHASE-1-LAUNCH.md`](./PHASE-1-LAUNCH.md) for full, kvitterbar liste.
