# DESIGN_SYSTEM.md — Offiview

> *Dagen, lagt på bordet.*

Dette er bibelen. Offiview er ikke et SaaS-verktøy — det er et stille øyeblikk der hele firmaet trer frem som ett klart landskap. Merket er ikke laget for å bli lagt merke til. Det er laget for å la brukeren se resten.

Følg dokumentet strengt. Hvis det ikke ser spektakulært ut, er det ikke ferdig.

---

## 0. Idéen bak alt

**Ett merke. Én idé. Sirkelen, og horisonten som deler den.**

- Sirkelen = helheten. Hele synsfeltet, hele teamet, hele uken.
- Horisonten = det ene du ser tydelig akkurat nå.
- Forholdet mellom **overblikk** og **oppmerksomhet**. Mellom **alt** og **det som betyr noe**.

Horisonten står på **y = 62 %**, ikke 50 %. Aldri i midten. Det er produktet, destillert til en strek.

---

## 1. Farge — elleve toner, ikke én for mye

Paletten er delt i **tre slekter**:

- **Jord** for hverdag
- **Glød** for handling
- **Nordlys** for drama — kun der det virkelig betyr noe

### Jord (canvas + tekst)

| Token | Hex | Bruk |
|-------|-----|------|
| `--paper` | `#F5EFE4` | Hovedbakgrunn, lys modus |
| `--paper-soft` | `#EDE5D1` | Elevated cards, input-bakgrunn |
| `--stone` | `#E0D8C8` | Hairline borders, divider |
| `--stone-soft` | `#F0EADF` | Subtle hover, muted surfaces |
| `--ink` | `#0E0B08` | Primær tekst, lys modus |
| `--espresso` | `#15110E` | Dashboard-mørkbakgrunn (IKKE kald `#0A0B0E`) |
| `--dusk` | `#1F1913` | Elevated dark surfaces, sekundærtekst lys |
| `--mist` | `#8A7F70` | Metadata, tertiærtekst, eyebrows |

### Glød (Ember — action)

| Token | Hex | Bruk |
|-------|-----|------|
| `--ember` | `#B45309` | Primær-accent lys modus, CTA, ring |
| `--ember-soft` | `#D97706` | Hover, sekundær-accent, gradienter |
| `--ember-glow` | `#FBBF24` | Primær-accent dark modus, fremheving, dashboard-tall |
| `--ember-deep` | `#78350F` | Skygger, dyp gradient-stopp |

### Nordlys (signatur)

| Token | Hex | Rolle |
|-------|-----|-------|
| `--nordlys-a` | `#00F5A0` | Første stopp — mint |
| `--nordlys-b` | `#00D9F5` | Midt — cyan |
| `--nordlys-c` | `#7C3AED` | Slutt — violet |

Kanonisk gradient:
```css
background: linear-gradient(120deg, #00F5A0 0%, #00D9F5 55%, #7C3AED 100%);
```
Horisontal horisont-variant (for mark og understrek):
```css
background: linear-gradient(90deg, var(--nordlys-a), var(--nordlys-b));
```

### 🌟 Nordlys-regelen: **Kun én gang per flate**

Dette er den viktigste regelen i hele designsystemet.

**Nordlys er ikke en aksent. Det er en signatur.**

- Lov: **maks ett** Nordlys-element per skjermbilde. Hero-tallet. App-ikonet i mørk modus. Kampanjebildet. Horisonten i logoen når den står frem.
- Ulov: to Nordlys på samme skjerm. Det ødelegger effekten og gjør merket billig.
- Test: **"Hvis du ser Nordlys to ganger på samme skjerm, har du brukt det galt."**

Når brukeren ser Nordlys skal det føles som å se noe sjeldent. Ember holder det varme, hverdagslige. Nordlys holder det sjeldne.

### Nøytrale (semantic)

```css
/* Lys modus */
--bg-primary:    var(--paper);
--bg-elevated:   var(--paper-soft);
--bg-subtle:     var(--stone-soft);
--text-primary:   var(--ink);
--text-secondary: var(--dusk);
--text-tertiary:  var(--mist);
--border-subtle: var(--stone);
--accent-color:  var(--ember);

/* Mørk modus (dashboard) */
--bg-primary:    #15110E;  /* espresso — varm, ikke kald */
--bg-elevated:   #1F1913;  /* dusk */
--text-primary:  #F5EFE4;  /* paper */
--accent-color:  #FBBF24;  /* ember-glow */
```

---

## 2. Typografi — to fonter, mange stemninger

### Familier

```ts
// src/app/fonts.ts
import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google'

fontDisplay = Fraunces({ axes: ['opsz', 'SOFT'], style: ['normal','italic'], weight: 'variable' })
fontBody    = Manrope({ weight: 'variable' })   // 200..800
fontMono    = JetBrains_Mono({ weight: 'variable' })
```

| Rolle | Font | Når |
|-------|------|-----|
| Display / serif | **Fraunces** | Titler, tall, tagline, hver emosjonell beat |
| Body / UI | **Manrope** | All lesetekst, knapper, form-elementer, navigasjon |
| Mono | JetBrains Mono | Små caps-meta-labels, timer, tabular nums |

### Fraunces — variable axes

Fraunces har fire axes: `opsz` (9–144), `SOFT` (0–100), `wght` (100–900), `ital` (0/1).

Bruk disse tre paringene:

| Rolle | opsz | SOFT | weight | style |
|-------|------|------|--------|-------|
| **Type-monster** (hero, dashboard-tall) | 144 | 100 | 300 | normal |
| **Seksjonsoverskrift** (h2) | 144 | 80 | 300 | normal |
| **Body-big lede** | 32 | 80 | 300 | normal |
| **Italic Ember-ord** (inline emphasis) | 32 | 60 | 300 | **italic** |
| **Italic eyebrow/sub** (små italics) | 14–18 | 40 | 300 | **italic** |
| **Sec-num (01 · Idé)** | 9 | – | 300 | italic |

**Kritisk:** italic-varianten brukes for *Ember-ord* i overskrifter. Det er den eneste korrekte måten å bruke Ember på i tekst. Bruk `<em>` i JSX/HTML.

Eksempel:
```tsx
<h1 className="font-display">
  Dagen,<br />lagt på <em style={{ color: 'var(--ember)' }}>bordet</em>.
</h1>
```

### Manrope — UI-font

Variable weight 200–800. Bruk `feature-settings: "ss01", "ss02"` (satt globalt i `html`). Tabular numerals via `.tabular-nums`-klasse.

| Rolle | Størrelse | Weight | Letter-spacing |
|-------|-----------|--------|----------------|
| Wordmark (liten) | 22–32px | 300 | -0.04em |
| Wordmark (stor) | 48–96px | 300 | -0.04em |
| Body-big | 17px | 400 | 0 |
| Body | 15px | 400 | 0 |
| Metadata | 11px | 500 | 0.14em uppercase |
| Eyebrow | 10–11px | 500 | 0.16–0.18em uppercase |

### Skala (Fraunces)

| Token | Størrelse | Line-height | Bruk |
|-------|-----------|-------------|------|
| `display-2xl` | clamp(100px, 18vw, 280px) | 0.85 | Type-monster |
| `display-xl` | clamp(64px, 11vw, 168px) | 0.92 | Hero h1 |
| `display-lg` | clamp(48px, 6vw, 88px) | 1.0 | Dashboard-hero, sidetitler |
| `display-md` | clamp(40px, 6vw, 80px) | 1.0 | h2 seksjon |
| `lede` | clamp(20px, 2.2vw, 26px) | 1.45 | Hero-sub |
| `body-big` | clamp(28px, 3.5vw, 44px) | 1.25 | Fraunces body-big |

### Regler

- Letter-spacing: `-0.045em` på display over 120px. `-0.028em` på h2. `-0.02em` på lede.
- Italic = alltid Fraunces + Ember-farge (eller Nordlys i mørk modus).
- **Aldri** Manrope italic. Hvis italic — bruk Fraunces.
- Tall: `font-variant-numeric: tabular-nums` alltid på klokker, datoer, uker, metrics.

---

## 3. Logoen

Logo-arkitektur = sirkel + horisont ved 62 %. Ingen serif, ingen filler, ingen skinner.

```tsx
import { OffiviewMark } from '@/components/brand/offiview-mark'
import { OffiviewWordmark } from '@/components/brand/offiview-wordmark'

<OffiviewWordmark size={28} variant="ink" />
```

### Fire stemninger, ett merke

| Variant | Overflate | Stroke | Når |
|---------|-----------|--------|-----|
| `ink` | Paper | currentColor (ink) | Default lys modus |
| `paper` | Espresso / Ember | currentColor (paper) | Dark / campaign |
| `ember` | Paper | Ember→glow gradient | Kampanje, accent-moment |
| `nordlys` | Espresso | Nordlys gradient + glow | Signatur — **én gang per flate** |

### Geometri

- `viewBox="0 0 100 100"` — sirkel r=47 ved stroke-width=6
- Horisont: fra `x=15` til `x=85`, på `y=62`
- Stroke-width=6 på store (>=64px), 2.5 på små (≤32px favicon)
- `stroke-linecap="round"`

### Anvendelser

- **Header** (lys modus): `<OffiviewWordmark size={22} variant="ink" />`
- **Login-side**: `size={36}`, variant ink
- **Favicon** (`app/icon.svg`): Paper bg + Ink mark, ingen gradient (32×32 trenger kontrast, ikke drama)
- **Apple touch icon** (`app/apple-icon.svg`): Espresso bg + Nordlys horisont — én gang per device
- **Dashboard header**: `variant="paper"`, Paper farge følger currentColor

### Motion — «Horisonten stiger»

Logoens entré:
1. Ring fader inn (0.85 → 1 scale) over 1.8s ease `cubic-bezier(0.2, 0.8, 0.3, 1)`
2. Horisonten vokser fra venstre (`scaleX: 0 → 1`) over 1.6s med 0.8s delay

**Regelen: Spilles én gang per app-start. Aldri i loop i produktet.** Loop kun tillatt på brand-sider (landing, about).

```tsx
<motion.line
  x1={15} x2={85} y1={62} y2={62}
  initial={{ pathLength: 0 }}
  animate={{ pathLength: 1 }}
  transition={{ duration: 1.6, ease: [0.2, 0.8, 0.3, 1], delay: 0.8 }}
/>
```

---

## 4. Lys vs. mørk

### Lys (default — marketing, produkt, hverdag)

- Bg: `#F5EFE4` Paper
- Aksent: Ember `#B45309`
- Tekst: Ink
- Stemning: håndverk, papir, morgenlys

### Mørk (dashboard, TV-skjerm)

Dashboard lever i mørket — men det er **ikke en kald SaaS-bakgrunn**. Det er varm espresso, med glød i kantene og nordlys for signaturtallene.

Mørk modus skal føles som **et kontor etter arbeidstid**, ikke som et serverrom.

- Bg: `#15110E` Espresso
- Aksent: Ember-glow `#FBBF24` (varmere enn Ember i dark)
- Tekst: Paper
- Ambient aurora: Ember + hvisker av Nordlys (mix-blend overlay)
- Dashboard tvinger `.dark` via `DashboardDarkLock`-komponenten, uavhengig av bruker-preferanse

### Årstids-varianter (dashboard bakgrunn)

Dashboard-bakgrunnen kan graderes etter årstid:

| Årstid | Gradient | Accent |
|--------|----------|--------|
| Vinter | `#0A0A0F → #15110E` | Nordlys-glow (polarnatt) |
| Vår | `#F5EFE4 → #EDE5D1` | Cyan-tåke |
| Sommer | `#F5EFE4 → #FBBF24` | Ember-varme |
| Høst | `#B45309 → #78350F` | Ember-glow |

Implementeres som `[data-season="winter"]` override på dashboard-wrapper.

---

## 5. Grain — det taktile laget

Hele appen har et fast fraktal-støy-lag over bakgrunnen. Dette gir papir-følelse og bryter digital flathet.

```css
body::before {
  content: "";
  position: fixed; inset: 0;
  z-index: 1; pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,...feTurbulence baseFrequency=0.9 numOctaves=3...");
}
.dark body::before {
  mix-blend-mode: overlay;
  opacity: 0.35;
}
```

- `feTurbulence baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"`
- Alpha-matrise: `0 0 0 0.08 0` (8 % alpha)
- Lys modus: `multiply` 50 % — grain mørkner Paper subtilt
- Mørk modus: `overlay` 35 % — grain hvisker mot Espresso

**Main-innholdet må ha `z-index: 2`** eller høyere for å ligge over grain. Dette er satt i `layout.tsx`.

---

## 6. Form — spacing, radius, skygger

### Spacing

4px grid (Tailwind standard). **Vær romslig**: `p-8` fremfor `p-4`, `gap-6` fremfor `gap-3`. La ting få plass.

### Radius

```css
--radius-sm:   8px;      /* chips, tags */
--radius-md:   12px;     /* knapper, input, kort på dashboard */
--radius-lg:   16px;     /* cards, motion-block */
--radius-xl:   24px;     /* store paneler */
--radius-2xl:  32px;     /* modaler, hero-kort */
```

Standard kort: `rounded-2xl` (16px). Ikke `rounded-lg` — for sjeldent sett på premium.

### Skygger — varme, ikke grå

```css
--shadow-lg:
  0 30px 60px -18px rgba(14, 11, 8, 0.18),
  0 14px 30px -14px rgba(14, 11, 8, 0.12),
  0 1px 2px rgba(14, 11, 8, 0.06);

--shadow-accent:
  0 8px 24px color-mix(in oklab, var(--ember) 22%, transparent),
  0 2px 4px color-mix(in oklab, var(--ember) 12%, transparent);
```

Skygger bruker **ink med warm-opacity**, aldri nøytral grå. I mørk modus: dypere ink-skygger, Paper hairline inset.

---

## 7. Bevegelse

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

- Aldri `left/top/width/height` — bruk `transform` og `opacity`
- Aldri lengre enn **400 ms** (unntatt logo-entré som er 1.8 s)
- Staggers maks 50 ms mellom elementer
- Alltid `prefers-reduced-motion` fallback — reduser til opacity
- Default easing: `ease.horizon` for alt i Offiview-stil

### Dashboard-refresh

- Status-endring: `motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}`
- Ukebytte: slide 40px + opacity, `spring.snappy`
- Auto-refresh hvert 30. sek — fade, ikke hop

---

## 8. Status-ikoner

Egendefinerte SVG i `src/components/status-icon.tsx`. Ikke emoji.

| Status | Konsept |
|--------|---------|
| Kontor | Minimalistisk bygning med 2 vinduer |
| Hjemmekontor | Hus med skorstein, enkelt |
| Hos kunde | Håndtrykk, abstrakt |
| Reise | Papirfly i 45° |
| Ferie | Sol med stråler over bølgeformer |
| Syk | Termometer med gradient |
| Fri | Måne eller pauset sirkel |

**Spec:**
- 24×24 viewBox
- 2px strek
- `stroke-linecap="round"`, `stroke-linejoin="round"`
- Fill: 10–15 % opasitet i statusfargen
- Stroke: 100 % i statusfargen

---

## 9. Stemme (voice)

Offiview snakker kort, rolig, aldri korporativt.

### Gjør

- *Dagen, lagt på bordet.*
- *Hvem er her. Hvem er der. Ferdig.*
- *Ro i det åpne landskapet.*
- *Et felles blikk. En enklere uke.*
- Skriv som et menneske hadde sagt det, men med én tanke mindre.

### Ikke gjør

- ~~"Unleash productivity"~~
- ~~"Synergize your team's workflow"~~
- ~~"Empower distributed collaboration"~~
- ~~Engelske superlativer, tredobbelt substantivert~~
- ~~Utropstegn, corporate-smil, tomgang-energi~~

### Tagline-galleri

| Tagline | Kontekst |
|---------|----------|
| Dagen, lagt på bordet. | Primary kampanje |
| Hvem er her. Hvem er der. Ferdig. | Produkt funksjonelt |
| Ro i det åpne landskapet. | Brand emosjonelt |
| Et felles blikk. En enklere uke. | Relasjonell |

---

## 10. Tilgjengelighet

- Kontrast ≥ 4.5:1 for all tekst. Paper + Ink = 18:1 ✓. Espresso + Paper = 15:1 ✓. Ember-glow + Espresso = 8.2:1 ✓.
- Focus-ring: 2px Ember, offset 3px, med Ember-glow box-shadow
- ARIA-label på alle interaktive elementer, inkludert OffiviewWordmark
- Tastaturnavigasjon: piltaster for uker, Enter/Space for aktivering
- `prefers-reduced-motion`: reduser til opacity-overganger. Logo-entré hopper rett til sluttilstand.

---

## 11. Oppsummering

Hvis du er i tvil:

1. **Mer spacing**, ikke mindre
2. **Mer subtil**, ikke mer metning
3. **Spring-animasjon**, ikke linear
4. **Fraunces for sjel**, Manrope for struktur
5. **Aldri emoji**, alltid SVG
6. **Warm-shadow**, aldri grå
7. **Test lys og mørk**
8. **Test mobil**
9. **Nordlys kun én gang**
10. **Horisonten på 62, aldri 50**

Hvis det ikke føles som et rolig pustende øyeblikk — det er ikke ferdig.
