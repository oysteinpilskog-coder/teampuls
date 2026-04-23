# Best Practices — TeamPulse

Levende dokument. Oppdater når konvensjoner endrer seg.

---

## 1. Kode

### TypeScript
- [x] `strict: true` (allerede på plass)
- [ ] Aldri `any` — bruk `unknown` + type-guards
- [ ] Discriminated unions for states (`{ status: 'loading' } | { status: 'ok', data } | { status: 'error', error }`)
- [ ] Export types fra `supabase/types.ts` — ikke duplisere
- [ ] Zod-schemas som single source of truth for runtime + type

### React / Next.js 16
- [ ] Default Server Components, kun `"use client"` når nødvendig
- [ ] Ikke importer tunge client-libs i Server Components
- [ ] `revalidatePath` / `revalidateTag` på mutations
- [ ] `Suspense` rundt tregere subtrær
- [ ] Lokale komponenter i `_components/` i rute-mappen, delte i `src/components/`
- [ ] Server actions for skjemaer (ikke API-ruter) når det gir mening
- [ ] Les Next.js 16-docs i `node_modules/next/dist/docs/` — API-er kan ha endret seg

### Naming
- [ ] Komponenter: `PascalCase.tsx`
- [ ] Hooks: `use-kebab-case.ts` → eksporter `useCamelCase`
- [ ] Utils: `kebab-case.ts`
- [ ] Types: `PascalCase` for typer, `camelCase` for verdier
- [ ] Konstanter: `SCREAMING_SNAKE_CASE` kun for true konstanter, ellers `camelCase`

### Struktur
- [ ] Maks 300 linjer per fil (over: splitt)
- [ ] Én default export per fil for komponenter
- [ ] Barrel-exports kun hvis det gir mening (ikke `index.ts` overalt)
- [ ] Data-fetching separert fra rendering (hooks eller utils)

### Kommentarer
- [ ] Skriv ikke-åpenbare WHY-kommentarer
- [ ] Ingen `// dette fikser bug X` — legg det i PR-beskrivelse
- [ ] TSDoc på eksporterte utils

---

## 2. Git & PR

- [ ] Branch-navn: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`
- [ ] Conventional commits (`feat:`, `fix:`, `chore:`)
- [ ] Små PR-er (< 400 linjer diff der mulig)
- [ ] PR-beskrivelse: hva, hvorfor, test plan, screenshot hvis UI
- [ ] Squash-merge til `main` (allerede workflow)
- [ ] Branch protection: CI må passere + 1 reviewer for Phase 2+

---

## 3. Database (Supabase / Postgres)

- [ ] Alle tabeller har `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- [ ] Alle tabeller har `created_at`, oppdaterbare har `updated_at` (trigger)
- [ ] Alle tenant-tabeller har `org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
- [ ] RLS påskrudd på alle tabeller i public-schema
- [ ] Policies bruker `current_user_org_ids()` og `current_user_is_admin(org_id)`
- [ ] Indexer på FK + ofte brukte filter-kombinasjoner
- [ ] Migrasjoner er append-only (aldri edit en publisert migrasjon)
- [ ] `DO $$` blokker for conditional DDL
- [ ] Soft delete vurderes hvis audit er viktig — ellers hard delete med cascade
- [ ] Foreign key constraints på ALLE relasjoner
- [ ] Check constraints for enums (eller bruk Postgres ENUM)
- [ ] JSONB-kolonner kun når schema er fleksibelt — ellers strukturer i tabeller

---

## 4. API-ruter

- [ ] Validate input med Zod
- [ ] Authenticate → Authorize → Validate → Execute
- [ ] Return 400/401/403/404/429/500 med konsistent JSON:
  ```json
  { "error": { "code": "RATE_LIMIT", "message": "...", "details": {...} } }
  ```
- [ ] Log request-ID + user-ID + error-stack
- [ ] Aldri lekk intern stack-trace til klient
- [ ] Idempotente endpoints der mulig (idempotency-key header)
- [ ] CORS kun for nødvendige origins
- [ ] Timeout på eksterne kall (Claude, Nominatim)

---

## 5. Sikkerhet

- [ ] Secrets aldri i repo (git-secrets eller pre-commit scan)
- [ ] Rotere nøkler ved brudd eller hver 90 dag (Stripe, Anthropic)
- [ ] Verifiser webhook-signaturer (Stripe, CloudMailin) med timing-safe compare
- [ ] Sanitér HTML-input (DOMPurify) hvis du noensinne renderer user HTML
- [ ] Ingen `dangerouslySetInnerHTML` med user-content
- [ ] CSP streng (start med report-only)
- [ ] Rate-limit alle public endpoints
- [ ] 2FA-støtte for admin-kontoer (fase 2+)
- [ ] Passord-policy hvis dere legger til passord-login (vurder: hold på magic link)

---

## 6. Ytelse

- [ ] Image-opt: `next/image` for alle bilder
- [ ] Font-opt: `next/font` (allerede delvis)
- [ ] Ikke blokker rendering på ikke-kritisk JS
- [ ] `loading="lazy"` utenfor viewport
- [ ] Memoize bare når profiler viser problem (React.memo / useMemo)
- [ ] Unngå `useEffect` for data-fetching på server (bruk RSC)
- [ ] DB-queries: bare hent kolonnene du trenger
- [ ] Batch queries der mulig
- [ ] Supabase `.select()` med explicit kolonner
- [ ] Unngå N+1 — joins eller batch-fetch

---

## 7. Tilgjengelighet (a11y)

- [ ] Semantisk HTML først (button før div+onClick)
- [ ] `<label>` koblet til alle inputs
- [ ] Focus-visible ring på alle interaktive
- [ ] Fargekontrast WCAG AA (4.5:1 tekst, 3:1 UI)
- [ ] `aria-label` på icon-only-knapper
- [ ] `aria-live` for toast/dynamiske updates
- [ ] `role="dialog"` + focus-trap i modaler
- [ ] Keyboard-nav på alle custom-widgets (tabs, combobox, etc.)
- [ ] Prefers-reduced-motion respektert i animasjoner
- [ ] Screen reader-tekst for skjulte tekst-elementer (`sr-only`)

---

## 8. i18n

- [ ] Ingen strenger hardkodet i komponenter — alle via `no.xxx`
- [ ] Variabler i strenger med `{name}`-interpolering (ikke konkatenering)
- [ ] Flertall / grammatikk via ICU-format når vi får flere språk
- [ ] Dato/tall via `Intl.DateTimeFormat` / `Intl.NumberFormat` med locale

---

## 9. Observability

- [ ] Strukturert logging (JSON, én linje per event)
- [ ] Nivåer: debug (dev), info (events), warn (uventet men ok), error (bug)
- [ ] Inkluder request-id, user-id, org-id i alle logs
- [ ] Sentry-breadcrumbs for navigasjon + API-kall
- [ ] Custom tags i Sentry: plan, org_id, locale
- [ ] Metrics: count(ai_parse_success), count(ai_parse_fail), p95(api_latency)

---

## 10. Incident response

- [ ] Runbook i `docs/RUNBOOK.md` (opprett ved incident #1)
- [ ] On-call-rotasjon (selv om 1 person, definer ansvar)
- [ ] Incident-severity: SEV1 (outage) / SEV2 (degraded) / SEV3 (bug)
- [ ] Post-mortem mal (blame-free)
- [ ] Status-page oppdateres innen 5 min ved SEV1
- [ ] Kunde-kommunikasjon via email innen 1 time ved SEV1

---

## 11. SEO (marketing-site)

- [ ] Unike `<title>` per side
- [ ] Meta-description 150-160 tegn
- [ ] OG-bilder per side
- [ ] `<h1>` en gang per side
- [ ] Sitemap.xml + robots.txt
- [ ] Strukturerte data (JSON-LD): Organization, WebApplication, SoftwareApplication
- [ ] Kanoniske URL-er
- [ ] Server-rendret innhold (ingen kritisk innhold kun i JS)

---

## 12. Økonomi / kost-kontroll

- [ ] Anthropic spending cap satt
- [ ] Supabase: overvåk row count, storage, egress
- [ ] Stripe: fee er 1.4% + 2.50 NOK i EU — regn inn i pricing
- [ ] Vercel: hobby → pro når trafikk krever, overvåk functions-exec
- [ ] Alerter ved 80% av månedsbudsjett per tjeneste
- [ ] Kill-switch for AI ved kost-eksplosjon
