# Teststrategi

**Nåværende status:** 0 tester. Kritisk gap.

Mål: kjøre `npm test` + `npm run e2e` før hver deploy, med confidence om at kjerneflyt ikke er ødelagt.

---

## 1. Testpyramide

```
      /\          E2E (få, trege, dekker flows)
     /  \          — Playwright, kjøres på PR + nightly
    /----\
   / Integ \       Integrasjon (middels, API + DB)
  /--------\       — Vitest + test-DB
 /   Unit   \      Unit (mange, raske, ren logikk)
/------------\    — Vitest + RTL
```

**Fordeling mål:** 70% unit / 20% integration / 10% E2E.

---

## 2. Verktøy

- [ ] **Vitest** — unit + integration runner (raskere enn Jest, Vite-basert)
- [ ] **React Testing Library** — komponent-tester
- [ ] **@testing-library/user-event** — realistisk interaksjon
- [ ] **MSW (Mock Service Worker)** — mock Supabase/Anthropic-responser
- [ ] **Playwright** — E2E i ekte browsere
- [ ] **@axe-core/playwright** — a11y-sjekker i E2E
- [ ] **faker-js** — testdata
- [ ] **supabase-local** eller egen test-prosjekt i Supabase for integ-tester

---

## 3. Unit-tester (fase 1, kritisk)

### AI-parsing
- [ ] `parseUpdate()` — happy path (gyldig Claude-respons)
- [ ] `parseUpdate()` — low-confidence returns clarification
- [ ] `parseUpdate()` — malformed JSON fra Claude håndteres
- [ ] `parseUpdate()` — empty input
- [ ] `parseUpdate()` — SQL-injection-forsøk i input
- [ ] `applyUpdates()` — INSERT happy path
- [ ] `applyUpdates()` — UPDATE existing entry
- [ ] `applyUpdates()` — DELETE entry
- [ ] `applyUpdates()` — member_id ikke funnet
- [ ] `applyUpdates()` — date-range spans multiple entries

### Date-utils (`lib/dates.ts`)
- [ ] ISO-uke-beregning (år-grenser: uke 52/53, uke 1)
- [ ] Date range expansion (1. jan – 31. des)
- [ ] Timezone-håndtering (entry i Oslo vs New York)

### Customer-resolver (`lib/customer-resolver.ts`)
- [ ] Eksakt navn-match
- [ ] Alias-match
- [ ] Case-insensitive
- [ ] Ingen match returnerer null
- [ ] Multiple matches — velger best

### Presence-logikk (`lib/presence.ts`)
- [ ] Status-resolusjon med override
- [ ] Default-presence-assumption (none|office|remote|per_member)
- [ ] Member uten home_office

### Geo (`lib/geo.ts`)
- [ ] Haversine-avstand
- [ ] Timezone-lookup fra lat/lng

### Suggest-days (`lib/ai/suggest-days.ts`)
- [ ] Finner dag hvor flest er på kontor
- [ ] Ignorerer ferie/sykdom
- [ ] Respekterer ukedag-filter

### Komponenter
- [ ] `<TeamGrid>` renderer tomt state
- [ ] `<TeamGrid>` renderer entries
- [ ] `<CellEditor>` lagrer ved submit
- [ ] `<WorkspaceSwitcher>` bytter workspace
- [ ] `<AIInput>` sender til API og viser feedback
- [ ] `<EmptyState>` har riktig CTA

---

## 4. Integrasjonstester (fase 1, kritisk)

Kjører mot en **test-Supabase-instans** (egen prosjekt eller local).

### API-ruter
- [ ] `POST /api/ai/parse` — autentisert bruker får 200 med gyldige entries
- [ ] `POST /api/ai/parse` — uautentisert får 401
- [ ] `POST /api/ai/parse` — ugyldig input får 400
- [ ] `POST /api/ai/parse` — rate-limit treffer returnerer 429
- [ ] `POST /api/email-inbound` — gyldig token + payload oppretter entries
- [ ] `POST /api/email-inbound` — ugyldig token får 401
- [ ] `POST /api/email-inbound` — ukjent sender-email håndteres (log + ignore)
- [ ] `POST /api/workspace/switch` — bytter cookie
- [ ] `GET /auth/callback` — linker member ved email-match

### RLS-verifikasjon
- [ ] Bruker A kan IKKE lese entries fra org som A ikke er medlem av
- [ ] Bruker A kan IKKE oppdatere members i org som A ikke er admin i
- [ ] Member (ikke admin) kan IKKE slette offices
- [ ] Admin kan legge til member
- [ ] Etter workspace-switch får bruker kun aktivt org sine data
- [ ] Storage: bruker A kan ikke slette bruker B's logo

### Realtime
- [ ] Insert entry i org X → alle medlemmer av X får realtime-event
- [ ] Bruker som ikke er i X får IKKE event

---

## 5. E2E-tester (Playwright)

Kjøres på PR (kritisk suite, < 5 min) + nightly (full suite).

### Kritisk suite (må passere for deploy)
- [ ] Signup → verifiser email → opprett første entry via AI
- [ ] Login → hovedside renderes med team grid
- [ ] Bytt workspace via ⌘1
- [ ] Legg til medlem (admin)
- [ ] Fjern medlem (admin)
- [ ] Slett egen entry
- [ ] Logout

### Utvidet suite (nightly)
- [ ] Full onboarding-wizard
- [ ] Opprett + redigere + slett office
- [ ] Opprett + redigere + slett customer
- [ ] Stripe Checkout (test-mode) → webhook → plan oppgradert
- [ ] Downgrade → features gated
- [ ] GDPR-eksport genereres og lastes ned
- [ ] Konto-sletting
- [ ] Year wheel renderer
- [ ] Dashboard carousel kjører 4 views
- [ ] Dark mode toggle persisterer
- [ ] Keyboard-nav på team grid
- [ ] Command palette (⌘K) + søk

### a11y (hver rute)
- [ ] Axe-scan uten violations på: `/`, `/login`, `/dashboard`, `/min-plan`, `/wheel`, `/settings/*`
- [ ] Focus-rekkefølge logisk
- [ ] Alle interaktive elementer keyboard-aktiverbare

### Visuell regresjon (valgfritt i fase 1)
- [ ] Chromatic eller Percy — baseline screenshots
- [ ] Review-godkjenning for UI-endringer

---

## 6. Ytelse-tester

- [ ] **Lighthouse CI** i GitHub Actions — terskel Perf ≥ 90
- [ ] **k6 eller Artillery** load-test:
  - [ ] 100 samtidige brukere på team grid
  - [ ] 50 AI-parse-requests/min (simulert)
  - [ ] 1000-entry seed → p95 < 500ms for grid-render
- [ ] **Bundle-size budsjett**: < 200KB gz på hovedrute, CI feiler over

---

## 7. Sikkerhetstester

- [ ] **npm audit** i CI (høy/kritisk = fail)
- [ ] **Dependabot** aktivert
- [ ] **Snyk** eller **Socket.dev** scanning
- [ ] **OWASP ZAP** baseline scan på staging
- [ ] **Manual pen-test** før lansering (eksternt firma eller bug bounty)
- [ ] Semgrep / CodeQL for statisk analyse

---

## 8. Manuell QA / UAT-sjekkliste

Kjøres av 3–5 testbrukere siste uken før lansering.

### Signup & onboarding
- [ ] Signup med ny email fungerer
- [ ] Magic link leveres innen 30s
- [ ] Første gang: onboarding-wizard vises
- [ ] Inviter 2 kolleger — de får email — de logger inn og ser samme workspace
- [ ] Legg til kontor med norsk adresse → geolokasjon korrekt
- [ ] Legg til kunde → vises i customer-dropdown

### Kjerneflyt
- [ ] Skriv "Øystein kunde ACME tirsdag" → entry opprettes
- [ ] Skriv "Hjemmekontor hele uke 17" → 5 entries opprettes
- [ ] Skriv "Ferie 15. juli til 1. august" → 12 entries
- [ ] Klikk i celle → rediger → lagre
- [ ] Drag mellom datoer → entry oppdateres
- [ ] Slett entry → oppdatering på alle andre sine skjermer innen 2s (realtime)

### Dashboard
- [ ] /dashboard kjører 4 views i loop
- [ ] Office-map viser kontorer på riktige koordinater
- [ ] Customer-map viser kundebesøk
- [ ] Today-view viser kun aktive i dag

### Multi-workspace
- [ ] Bruker med 2 workspaces kan bytte
- [ ] Data isolert mellom workspaces
- [ ] ⌘1/⌘2 fungerer

### Admin
- [ ] Endre org-navn → reflekteres overalt
- [ ] Last opp logo → vises i header
- [ ] Endre status-farger → reflekteres
- [ ] Fjern medlem → deres entries forblir (eller slettes, avhengig av policy)

### Edge cases
- [ ] Uke over nyttår (52 → 1)
- [ ] Skuddår (feb 29)
- [ ] Timezone-endringer (sommer/vinter)
- [ ] Veldig lange medlems-navn
- [ ] 50+ medlemmer i en org
- [ ] 1000+ entries lastes
- [ ] Mobil (iPhone SE, Android small)
- [ ] Safari + Firefox + Chrome + Edge
- [ ] Offline → kommer tilbake online
- [ ] Dårlig nettverk (throttled 3G)

### Billing
- [ ] Test-kort fullfører trial → oppgradert til pro
- [ ] Kansellér → beholder tilgang til period-end
- [ ] Reactivate
- [ ] Failed payment → 3 retry-forsøk → suspender

### Sikkerhet
- [ ] Kan ikke se andre orgs data via URL-manipulering
- [ ] Kan ikke kalle admin-endpoints uten admin-rolle
- [ ] Session utløper etter inaktivitet
- [ ] Logout fjerner alle cookies

### Juridisk
- [ ] Privacy policy-lenke i footer fungerer
- [ ] ToS-lenke fungerer
- [ ] Cookie-banner vises første besøk
- [ ] GDPR-eksport-knapp gir nedlastbar fil

---

## 9. Test-hygiene

- [ ] Tester er deterministiske (ingen flaky)
- [ ] Ingen tester er `.skip` eller `.only` i main
- [ ] Seed-data er isolert per test (ingen cross-test mutation)
- [ ] CI-runtime < 10 min for fast suite
- [ ] Coverage ≥ 70% på kjernemoduler (lib/ai, lib/presence, lib/dates)
- [ ] Ny funksjonalitet kommer med tester (PR-template sjekker)
