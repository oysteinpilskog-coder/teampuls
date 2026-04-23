export type ThemeId =
  | 'nordic'
  | 'obsidian'
  | 'aurora'
  | 'crystal'
  | 'ember'
  | 'sakura'
  | 'forest'
  | 'monaco'
  | 'champagne'

export interface ThemeMeta {
  id: ThemeId
  name: string
  tagline: string
  accent: string
  previewGradient: string
  finish: 'Glass' | 'Gloss' | 'Satin' | 'Matte' | 'Liquid'
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'nordic',
    name: 'Offiview',
    tagline: 'Papir, blekk og glød',
    accent: '#B45309',
    previewGradient: 'linear-gradient(135deg, #F5EFE4 0%, #E0D8C8 45%, #B45309 100%)',
    finish: 'Satin',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Polert kull med gylden glød',
    accent: '#D4AF37',
    previewGradient: 'linear-gradient(135deg, #0B0B0B 0%, #2B2B2B 45%, #D4AF37 100%)',
    finish: 'Gloss',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Fargerik nordlysrefleks',
    accent: '#8B5CF6',
    previewGradient: 'linear-gradient(135deg, hsl(280,85%,62%) 0%, hsl(200,90%,60%) 50%, hsl(160,80%,55%) 100%)',
    finish: 'Liquid',
  },
  {
    id: 'crystal',
    name: 'Crystal',
    tagline: 'Frostet is og arktisk luft',
    accent: '#06B6D4',
    previewGradient: 'linear-gradient(135deg, hsl(190,90%,72%) 0%, hsl(220,80%,88%) 60%, hsl(210,40%,96%) 100%)',
    finish: 'Glass',
  },
  {
    id: 'ember',
    name: 'Ember',
    tagline: 'Rav og glødende kobber',
    accent: '#F97316',
    previewGradient: 'linear-gradient(135deg, hsl(18,95%,58%) 0%, hsl(35,95%,60%) 55%, hsl(358,80%,55%) 100%)',
    finish: 'Satin',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    tagline: 'Kirsebærblomst og skumring',
    accent: '#EC4899',
    previewGradient: 'linear-gradient(135deg, hsl(340,85%,75%) 0%, hsl(320,70%,80%) 60%, hsl(260,60%,72%) 100%)',
    finish: 'Satin',
  },
  {
    id: 'forest',
    name: 'Forest',
    tagline: 'Dyp skog og mose',
    accent: '#10B981',
    previewGradient: 'linear-gradient(135deg, hsl(160,70%,38%) 0%, hsl(140,50%,48%) 55%, hsl(90,55%,68%) 100%)',
    finish: 'Matte',
  },
  {
    id: 'monaco',
    name: 'Monaco',
    tagline: 'Ren monokrom med elektrisk blå',
    accent: '#2563EB',
    previewGradient: 'linear-gradient(135deg, #000000 0%, #2563EB 70%, #FFFFFF 100%)',
    finish: 'Matte',
  },
  {
    id: 'champagne',
    name: 'Champagne',
    tagline: 'Myk gull og perlemor',
    accent: '#B8860B',
    previewGradient: 'linear-gradient(135deg, hsl(44,65%,78%) 0%, hsl(38,70%,68%) 50%, hsl(28,55%,58%) 100%)',
    finish: 'Liquid',
  },
]

export const DEFAULT_THEME: ThemeId = 'nordic'
export const THEME_STORAGE_KEY = 'teampulse.theme-variant'

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some(t => t.id === v)
}
