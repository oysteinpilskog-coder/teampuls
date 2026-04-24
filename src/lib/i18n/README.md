# i18n — slik funker det, slik utvider du

Offiview har fem språk i dag: **norsk (no)**, **engelsk (en)**, **svensk (sv)**,
**spansk (es)**, **litauisk (lt)**. Alle fem er alltid i synk fordi TypeScript
håndhever det.

## Kjernen — én sannhet

`no.ts` er kilden. `types.ts` lager `Dictionary`-typen fra `typeof no`, og alle
andre språkfiler (`en`, `sv`, `es`, `lt`) erklærer seg som `Dictionary`.
Resultat: legger du til en nøkkel i `no.ts`, **nekter TypeScript å bygge** før
den samme nøkkelen finnes i alle fire andre filer.

```
no.ts (kilde) ──┐
                ├── Dictionary ← en.ts, sv.ts, es.ts, lt.ts (må matche)
types.ts ───────┘
```

Kjør `npx tsc --noEmit` når du er usikker — null feil = ferdig.

---

## Legg til en ny statustype (f.eks. en ny kategori etter `event`)

Sist dette ble gjort (`event` for messer/kurs) var blast-radius ~15 filer.
Rekkefølgen:

1. **Database**: ny migrasjon med `ALTER TYPE entry_status ADD VALUE 'xxx'`
   + oppdater `members.default_status` CHECK-constraint.
2. **Type**: utvid `EntryStatus` i `src/lib/supabase/types.ts` og samme union
   øverst i `src/components/icons/status-icons.tsx`.
3. **Farge**: legg til hex i `src/lib/status-colors/defaults.ts`
   (`DEFAULT_HEX_COLORS`) og i `derivePalettes` (`src/lib/status-colors/derive.ts`).
4. **Ikon**: lag ny `XxxIcon`-komponent i `status-icons.tsx`, add i
   `STATUS_COLORS`-map og i `StatusIcon`-switch.
5. **Språk — alle fem**: legg `xxx: 'Etikett'` i `status`-blokken i `no.ts`
   først. TypeScript gir feil i `en.ts`, `sv.ts`, `es.ts`, `lt.ts` helt til du
   fyller inn der også.
6. **AI-parser**: `src/lib/ai/prompts.ts` — legg til i `## Statuskoder`-lista
   og i kategorikaskaden hvis relevant. `src/lib/ai/query.ts` — `VALID_STATUSES`.
7. **UI-arrays**: grep for `ALL_STATUSES` og `STATUS_ORDER`, oppdater hver
   treff (rundt 8 filer — `team-grid`, `my-plan`, `cell-editor`,
   `presence-heatmap`, `settings/org-client`, `dashboard-views/{hero-pulse,
   month-view,today-view,team-board,aurora-background,customer-map-view}`).
8. **Pulse-gruppering**: i `today-view.tsx`, `team-board.tsx`, `hero-pulse.tsx`,
   `aurora-background.tsx`, `team-health.ts` — bestem om ny status går i
   "Akkurat nå"-kolonnen Kontor / Hjemme / Kunde / Borte.

TypeScript fanger #2, #3, #5, #7, #8. #1 og #6 må du huske selv.

---

## Legg til et nytt språk (f.eks. finsk)

Ren mekanisk oppgave — TypeScript peker ut alt som mangler.

1. Opprett `src/lib/i18n/fi.ts` ved å kopiere `en.ts` og oversette. Start
   med `export const fi: Dictionary = { ... }`.
2. I `types.ts`:
   - Utvid `Locale`-unionen: `'no' | 'en' | 'sv' | 'es' | 'lt' | 'fi'`
   - Legg `'fi'` i `LOCALES`-arrayet
   - Legg entry i `LOCALE_META`:
     ```ts
     fi: { name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮', htmlLang: 'fi', intl: 'fi-FI' },
     ```
3. I `context.tsx` / `server.ts`: sjekk at begge har en `case 'fi':` eller
   tilsvarende switch som returnerer `fi`-importen.
4. Kjør `npx tsc --noEmit`. Hver manglende nøkkel får en konkret linjenr-feil.
5. Fyll ut til det er null feil. Ferdig.

---

## Daglige oppgaver

**Finne alle strenger som trenger oversettelse for en feature:**
```bash
git diff main...HEAD -- src/lib/i18n/no.ts
```
De andre språkfilene må matche samme endringer.

**Sjekke at alt er i synk:**
```bash
npx tsc --noEmit
```

**Ha et kallenavn for status i én visning** (f.eks. `atHomeShort`):
Egne nøkler ligger utenfor `status`-blokken — typisk i `pulse:` eller
`matrix:`. Samme regel: legg til i `no.ts`, følg TypeScript-feilene.

---

## Anti-mønstre

- **Ikke** hardkod norsk i komponenter. Alltid via `useT()`.
- **Ikke** lag fallback-strenger (`t.foo.bar ?? 'Default'`) — det skjuler
  manglende oversettelser. La TypeScript feile.
- **Ikke** endre en verdi i `en.ts` uten å sjekke om den samme er oversatt
  i de tre andre (kjør diff mot forrige commit).
