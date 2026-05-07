# DESIGN_SYSTEM.md — Offiview × CalWin BrandBook

> *Dagen, lagt på bordet.*

Dette er bibelen. Offiview er ikke et SaaS-verktøy — det er et stille øyeblikk der hele firmaet trer frem som ett klart landskap. Merket er ikke laget for å bli lagt merke til. Det er laget for å la brukeren se resten.

Følg dokumentet strengt. Hvis det ikke ser spektakulært ut, er det ikke ferdig.

**Single source of truth: [src/app/globals.css](../src/app/globals.css).** Dette dokumentet beskriver intensjonen og bruksreglene. Alle konkrete verdier kommer fra tokens der. Hvis dokumentet og koden er uenige, har koden rett — meld da fra om at dette dokumentet bør oppdateres.

---

## 0. Idéen bak alt

**Ett merke. Én idé. Sirkelen, og horisonten som deler den.**

- Sirkelen = helheten. Hele synsfeltet, hele teamet, hele uken.
- Horisonten = det ene du ser tydelig akkurat nå.
- Forholdet mellom **overblikk** og **oppmerksomhet**. Mellom **alt** og **det som betyr noe**.

Horisonten står på **y = 62 %**, ikke 50 %. Aldri i midten. Det er produktet, destillert til en strek.

---

## 1. Farge — CalWin-paletten

Paletten er CalWin BrandBook §3. Tre slekter:

- **Sølv** for hverdag (canvas)
- **Light Blue** for handling (accent — token-navn `--ember` av historiske grunner)
- **Blue Violet** som dyp tekst og dark-canvas
- **Nordlys** = den tillatte korporative gradienten Light Blue → Blue Violet, kun der det virkelig betyr noe

### Sølv (canvas + tekst i lys modus)

| Token | Hex | Bruk |
|-------|-----|------|
| `--paper` | `#EAEAE6` | Hovedbakgrunn, lys modus (Silver Gray) |
| `--paper-soft` | `#F7F7F4` | Elevated cards, input-bakgrunn |
| `--stone` | `#C9C8C2` | Synlig hairline border |
| `--stone-soft` | `#DCDBD5` | Subtle hover, muted surfaces |
| `--ink` | `#322E7A` | Primær tekst — Blue Violet |
| `--espresso` | `#1F1C52` | Deepest brand-blå (dark-canvas elevated) |
| `--dusk` | `#4A4595` | Mid blue violet, sekundærtekst i mørk |
| `--mist` | `#6B6694` | Metadata, tertiærtekst, eyebrows (passer AA på Silver) |

### Light Blue — primær accent (token-navn `--ember`)

CalWin-paletten har Light Blue som primær accent. Token-navnet **`--ember`** er bevart fra Offiview-tiden (~30 komponentfiler refererer til det) — kun verdiene endres.

| Token | Hex | Bruk |
|-------|-----|------|
| `--ember` | `#66C4EF` | Primær-accent, CTA, fokus-ring |
| `--ember-soft` | `#93D6F3` | Hover, sekundær-accent, gradient-stopp |
| `--ember-deep` | `#2DA4D0` | Pressed/aktiv, dyp gradient-stopp |
| `--ember-glow` | `#B3E2F7` | Pale glow, fremheving |

### Nordlys (signaturgradient)

CalWins korporative gradient er Light Blue → Blue Violet. Det er den eneste tillatte gradient-signaturen i produktet.

| Token | Hex | Rolle |
|-------|-----|-------|
| `--nordlys-a` | `#66C4EF` | Light Blue (start) |
| `--nordlys-b` | `#4A4595` | Mid blue violet |
| `--nordlys-c` | `#322E7A` | Blue Violet (slutt) |

Bruk de ferdige gradient-tokens i stedet for å bygge nye:

| Gradient-token | Vinkel | Bruk |
|----------------|--------|------|
| `--gradient-nordlys-clock` | `120deg` | Hero-tall, klokke, dashboard-display |
| `--gradient-nordlys-rail` | `90deg` | Horisontale fremdriftsskinner, understreker |
| `--gradient-nordlys-hero` | `180deg` | Hero-pill med hvit fade nedover |
| `--gradient-nordlys-pill` | `180deg` | Aktiv-pill tekstfyll |

```tsx
<div style={{ background: 'var(--gradient-nordlys-clock)' }}>…</div>
```

**Aldri** definer ny gradient med rå hex. Hvis du trenger en fjerde vinkel, legg til et nytt token i globals.css.

### 🌟 Nordlys-regelen: **Kun én gang per flate**

Dette er den viktigste regelen i hele designsystemet.

**Nordlys er ikke en aksent. Det er en signatur.**

- Lov: **maks ett** Nordlys-element per skjermbilde. Hero-tallet. App-ikonet i mørk modus. Kampanjebildet. Horisonten i logoen når den står frem.
- Ulov: to Nordlys på samme skjerm. Det ødelegger effekten og gjør merket billig.
- Test: **«Hvis du ser Nordlys to ganger på samme skjerm, har du brukt det galt.»**

Når brukeren ser Nordlys skal det føles som å se noe sjeldent. Light Blue (`var(--ember)`) holder det hverdagslige. Nordlys holder det sjeldne.

### Nøytrale (semantic)

Disse er definert i globals.css og skal alltid brukes via token, aldri hex:

```css
/* Lys modus */
--bg-primary:    var(--paper);        /* #EAEAE6 */
--bg-elevated:   var(--paper-soft);   /* #F7F7F4 */
--bg-subtle:     var(--stone-soft);   /* #DCDBD5 */
--text-primary:   var(--ink);          /* #322E7A */
--text-secondary: var(--dusk);         /* #4A4595 */
--text-tertiary:  var(--mist);         /* #6B6694 */
--border-subtle: var(--stone);        /* #C9C8C2 */
--accent-color:  var(--ember);        /* #66C4EF */

/* Mørk modus (dashboard) — Blue Violet-canvas */
--bg-primary:    #1F1C52;             /* deep blue violet */
--bg-elevated:   #322E7A;             /* canonical Blue Violet */
--text-primary:  #EAEAE6;             /* Silver Gray */
--accent-color:  #66C4EF;             /* Light Blue glows på Blue Violet */
```

### Semantiske feedback-farger

```css
--success:  #16A362;  /* lys */ /  #5BD391  (mørk) */
--error:    #C8323D;  /* lys */ /  #FF8A93  (mørk) */
--warning:  #C77B0E;  /* lys */ /  #F5B654  (mørk) */
```

Bruk alltid `var(--success)` etc., aldri rå hex.

---

## 2. Typografi — én font, mange stemninger

### Familier

CalWin bruker **Inter** for alle slots — én face på tvers av display, body og UI. Token-navnene `--font-fraunces` og `--font-manrope` er bevart fra Offiview-tiden så de ~30 komponent-referansene fortsatt resolver, men begge peker nå til Inter.

```ts
// src/app/fonts.ts
import { Inter } from 'next/font/google'

export const fontBody    = Inter({ variable: '--font-manrope',  weight: 'variable' })
export const fontDisplay = Inter({ variable: '--font-fraunces', weight: 'variable' })
```

| Rolle | Variabel | Når |
|-------|----------|-----|
| Display | `var(--font-display)` | Titler, tall, tagline, hero-numerikk |
| Body / UI | `var(--font-body)` | All lesetekst, knapper, form-elementer, navigasjon |
| Mono | system stack (SF Mono / Consolas / Menlo) | Små caps-meta-labels, klokker, tabular-nums via `.lg-mono` |

Mono leveres via system-stack (kalt fra `.lg-mono` i globals.css). Hvis du trenger mono i en ny komponent: bruk `.lg-mono`-klassen, ikke en hardkodet font-family-streng.

### Skala

| Token | Størrelse | Line-height | Bruk |
|-------|-----------|-------------|------|
| `display-2xl` | clamp(100px, 18vw, 280px) | 0.85 | Type-monster (hero-tall) |
| `display-xl` | clamp(64px, 11vw, 168px) | 0.92 | Hero h1 |
| `display-lg` | clamp(48px, 6vw, 88px) | 1.0 | Dashboard-hero, sidetitler |
| `display-md` | clamp(40px, 6vw, 80px) | 1.0 | h2 seksjon |
| `lede` | clamp(20px, 2.2vw, 26px) | 1.45 | Hero-sub |
| `body-big` | clamp(28px, 3.5vw, 44px) | 1.25 | Body-big |

### UI-rammeverk

| Rolle | Størrelse | Weight | Letter-spacing |
|-------|-----------|--------|----------------|
| Wordmark (liten) | 22–32px | 300 | -0.04em |
| Wordmark (stor) | 48–96px | 300 | -0.04em |
| Body-big | 17px | 400 | 0 |
| Body | 15px | 400 | 0 |
| Metadata | 11px | 500 | 0.14em uppercase |
| Eyebrow | 10–11px | 500 | 0.16–0.18em uppercase |

### Regler

- Letter-spacing: `-0.045em` på display over 120px. `-0.028em` på h2. `-0.02em` på lede.
- Italic for vekt-emfase: bruk `<em>` med `color: var(--ember)`. CalWin har ingen serif-italic, så italic-Inter må bære vekten — hold den til korte ord, aldri hele setninger.
- Tall: `font-variant-numeric: tabular-nums` alltid på klokker, datoer, uker, metrics. Bruk `.tabular-nums`-klassen.
- **Aldri** hardkod `font-family: 'Inter, …'` — bruk `var(--font-body)` eller `var(--font-display)`.

---

## 3. Logo og merke

CalWin BrandBook §1 logo + Offiview-wordmark. Begge eksisterer i koden:

| Komponent | Når |
|-----------|-----|
| `<CalwinMark size={N} />` | CalWin BrandBook 10-prikk-symbol — primært merke |
| `<OffiviewWordmark size={N} variant="ink"\|"paper" />` | Produktnavn-tekst i header, login, footer |

CalwinMark = 10-prikket sirkel (Blue Violet + Light Blue, varierende størrelser). Definert i [src/components/brand/calwin-mark.tsx](../src/components/brand/calwin-mark.tsx).

### Anvendelser

- **Header (lys modus):** `<OffiviewWordmark size={22} variant="ink" />`
- **Login:** `<CalwinMark size={36} />` over wordmark
- **Favicon** (`app/icon.svg`): Paper-bg + Ink-mark, ingen gradient (32×32 trenger kontrast, ikke drama)
- **Apple touch icon** (`app/apple-icon.svg`): Espresso-bg + Nordlys-aksent — én gang per device
- **Dashboard header:** `variant="paper"` for wordmark

---

## 4. Lys vs. mørk

### Lys (default — marketing, produkt, hverdag)

- Bg: `#EAEAE6` Silver Gray (paper)
- Accent: Light Blue `#66C4EF` (`--ember`)
- Tekst: Blue Violet `#322E7A` (`--ink`)
- Stemning: rolig kontorlys, kjølig sølv, klar himmel

### Mørk (dashboard, TV-skjerm)

Dashboard lever i Blue Violet — CalWins egen dypeste brand-farge. Ikke en kald SaaS-bakgrunn, ikke et serverrom: **brand-farge etter arbeidstid**.

- Bg: `#1F1C52` deep Blue Violet
- Accent: Light Blue `#66C4EF` (samme som lys — den glør på Blue Violet)
- Tekst: `#EAEAE6` Silver Gray
- Ambient aurora: Light Blue + paler glow over Blue Violet
- Dashboard tvinger `.dark` via `DashboardDarkLock` uavhengig av bruker-preferanse

---

## 5. Per-org SaaS brand-overrides

Offiview er flerleietager. Hver org kan ha sin egen `(brand_primary, brand_accent)` som redefinerer hele paletten.

- DB-kolonner: `workspaces.brand_primary`, `workspaces.brand_accent` (begge `^#[0-9a-f]{6}$`)
- Implementert i [src/lib/branding/css-overrides.ts](../src/lib/branding/css-overrides.ts)
- Server-rendret som `<style>`-blokk i `<head>` — null flash til defaults på hydrate
- Bygger hele rampen (`--ink`, `--dusk`, `--mist`, `--ember*`, `--nordlys-a/b/c`, dark-canvas) fra de to hex-verdiene via `color-mix(in oklab, …)`
- CalWin-defaults: `primary=#322E7A`, `accent=#66C4EF`

**Konsekvens for komponenter:** referer alltid til `var(--ember)` / `var(--nordlys-X)`, aldri rå hex. Org A vil ha CalWin-blå, org B vil ha sin egen brand-pair, men begge resolver gjennom samme tokens.

---

## 6. Grain — det taktile laget

Hele appen har et fast fraktal-støy-lag over bakgrunnen. Bryter digital flathet, gir taktil følelse på Silver-canvas.

- `feTurbulence baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"`
- Lys modus: `multiply` ~50 % — grain mørkner Silver subtilt
- Mørk modus: `overlay` ~35 % — grain hvisker mot Blue Violet

Implementert via `body::before` i globals.css. **Main-innholdet må ha `z-index: 2`** for å ligge over grain. Dette er allerede satt i `layout.tsx`.

---

## 7. Form — spacing, radius, skygger

### Spacing

4px-grid (Tailwind standard). **Vær romslig**: `p-8` fremfor `p-4`, `gap-6` fremfor `gap-3`. La ting få plass.

### Radius

```css
--radius-sm:   8px;    /* chips, tags */
--radius-md:   12px;   /* knapper, input */
--radius-lg:   16px;   /* cards */
--radius-xl:   24px;   /* store paneler */
--radius-2xl:  32px;   /* modaler, hero-kort */
```

Standard kort: `rounded-2xl` (16px). Ikke `rounded-lg` — for sjeldent sett på premium.

### Skygger — kjølig blå-tonet, ikke grå

CalWin-skygger bruker Blue Violet ink med opacity, aldri nøytral grå. Definert som `--shadow-sm/md/lg/xl` i globals.css.

```css
--shadow-lg: …rgba(31, 28, 82, 0.24)…;   /* Blue Violet ink */
```

I mørk modus: dypere svart-på-blue-skygger.

---

## 8. Bevegelse

### Spring-presets

```ts
// src/lib/motion.ts
spring.gentle   = { stiffness: 300, damping: 30 }
spring.snappy   = { stiffness: 400, damping: 25 }
spring.bouncy   = { stiffness: 500, damping: 20 }
spring.smooth   = { stiffness: 200, damping: 40 }

ease.horizon    = [0.2, 0.8, 0.3, 1]   // Offiview-standard
```

### Regler

- Aldri animer `left/top/width/height` — bruk `transform` og `opacity`
- Aldri lengre enn **400 ms** (unntatt logo-entré som er 1.8 s)
- Staggers maks 50 ms mellom elementer
- Alltid `prefers-reduced-motion` fallback — reduser til opacity
- Default easing: `ease.horizon`

### Dashboard-refresh

- Status-endring: `motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}`
- Ukebytte: slide 40px + opacity, `spring.snappy`
- Auto-refresh hvert 30. sek — fade, ikke hop

---

## 9. Status-ikoner

Egendefinerte SVG i `src/components/icons/status-icons.tsx`. **Aldri emoji.**

| Status | Konsept |
|--------|---------|
| Kontor | Minimalistisk bygning med 2 vinduer |
| Hjemmekontor | Hus med skorstein, enkelt |
| Hos kunde | Håndtrykk, abstrakt |
| Reise | Papirfly i 45° |
| Ferie | Sol med stråler over bølgeformer |
| Syk | Termometer med gradient |
| Avspasering | Måne eller pauset sirkel |

**Spec:**
- 24×24 viewBox
- 2px strek
- `stroke-linecap="round"`, `stroke-linejoin="round"`
- Fill: 10–15 % opasitet i statusfargen
- Stroke: 100 % i statusfargen

Statusfarger er org-tilpassbare via `--lg-cat-*`-tokens i globals.css, default Light Blue (kontor), Olive (reise) etc.

---

## 10. Stemme (voice)

Offiview snakker kort, rolig, aldri korporativt.

### Gjør

- *Dagen, lagt på bordet.*
- *Hvem er her. Hvem er der. Ferdig.*
- *Ro i det åpne landskapet.*
- *Et felles blikk. En enklere uke.*
- Skriv som et menneske hadde sagt det, men med én tanke mindre.

### Ikke gjør

- ~~«Unleash productivity»~~
- ~~«Synergize your team's workflow»~~
- ~~«Empower distributed collaboration»~~
- ~~Engelske superlativer, tredobbelt substantivert~~
- ~~Utropstegn, corporate-smil, tomgang-energi~~

### Tagline-galleri

| Tagline | Kontekst |
|---------|----------|
| Dagen, lagt på bordet. | Primær kampanje |
| Hvem er her. Hvem er der. Ferdig. | Produkt funksjonelt |
| Ro i det åpne landskapet. | Brand emosjonelt |
| Et felles blikk. En enklere uke. | Relasjonell |

---

## 11. Tilgjengelighet

- Kontrast ≥ 4.5:1 for all tekst:
  - Silver `#EAEAE6` + Blue Violet `#322E7A` = ~9:1 ✓
  - Blue Violet `#1F1C52` + Silver `#EAEAE6` = ~13:1 ✓
  - Light Blue `#66C4EF` + Blue Violet `#1F1C52` = ~5.6:1 ✓ (AA large)
- Focus-ring: 2px Light Blue (`var(--ember)`), offset 3px, med ember-glow box-shadow
- ARIA-label på alle interaktive elementer, inkludert merke-komponenter
- Tastaturnavigasjon: piltaster for uker, Enter/Space for aktivering
- `prefers-reduced-motion`: reduser til opacity-overganger. Logo-entré hopper rett til sluttilstand

---

## 12. Sjekkliste når du er i tvil

1. **Mer spacing**, ikke mindre
2. **Mer subtil**, ikke mer metning
3. **Spring-animasjon**, ikke linear
4. **Inter via tokens**, aldri rå `font-family`-streng
5. **Aldri emoji**, alltid SVG
6. **Blue Violet-skygger**, aldri grå
7. **Test lys og mørk**
8. **Test mobil**
9. **Nordlys kun én gang per flate**
10. **Horisonten på 62, aldri 50**
11. **Hex-litteraler er røde flagg** — bruk `var(--…)` og legg til nytt token hvis nødvendig
12. **Test som fremmed org** — sett `brand_primary/brand_accent` i Supabase og se at hele paletten omtrer riktig

Hvis det ikke føles som et rolig pustende øyeblikk — det er ikke ferdig.
