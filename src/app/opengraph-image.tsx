import { ImageResponse } from 'next/og'
import { getServerLocale } from '@/lib/i18n/server'
import { no } from '@/lib/i18n/no'
import { en } from '@/lib/i18n/en'
import { sv } from '@/lib/i18n/sv'
import { es } from '@/lib/i18n/es'
import { lt } from '@/lib/i18n/lt'

const DICT = { no, en, sv, es, lt }

export const alt = 'Offiview — dagen, lagt på bordet.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Brand palette mirrors --paper / --ink / --ember from globals.css.
// next/og can't load CSS variables, so the values are repeated literally.
// CalWin BrandBook §3: Silver Gray + Blue Violet + Light Blue.
const PAPER = '#EAEAE6'        // Silver Gray
const PAPER_SOFT = '#F7F7F4'   // near-white
const INK = '#322E7A'          // Blue Violet
const EMBER = '#66C4EF'        // Light Blue (accent)
const EMBER_GLOW = '#B3E2F7'   // pale Light Blue glow

export default async function OpenGraphImage() {
  const locale = await getServerLocale()
  const dict = DICT[locale]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '80px 96px',
          background: `linear-gradient(135deg, ${PAPER} 0%, ${PAPER_SOFT} 100%)`,
          position: 'relative',
        }}
      >
        {/* Soft Ember halo in the top-right — a hint of the in-app aurora. */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${EMBER_GLOW}40 0%, transparent 70%)`,
          }}
        />

        {/* Top: small Ember dot + tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: EMBER,
              boxShadow: `0 0 24px ${EMBER_GLOW}`,
            }}
          />
          <span
            style={{
              fontSize: 22,
              color: INK,
              opacity: 0.55,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {locale === 'no' ? 'Teamoversikt' : locale === 'sv' ? 'Teamöversikt' : locale === 'es' ? 'Vista del equipo' : locale === 'lt' ? 'Komandos vaizdas' : 'Team overview'}
          </span>
        </div>

        {/* Middle/bottom: name + tagline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 168,
              fontWeight: 700,
              color: INK,
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            {dict.app.name}
          </div>
          <div
            style={{
              fontSize: 40,
              color: INK,
              opacity: 0.7,
              fontStyle: 'italic',
              letterSpacing: '-0.01em',
            }}
          >
            {dict.app.tagline}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
