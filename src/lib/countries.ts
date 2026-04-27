// Hele settet av ISO 3166-1 alpha-2 koder. Listen er statisk per spec og
// endrer seg sjelden — inkluderer Færøyene (FO), Island (IS), grønland (GL),
// og alt annet som offisielt har en alpha-2-kode pr. ISO sin liste.
//
// Vi bruker `Intl.DisplayNames` til å oversette koden til ledig språk,
// så vi slipper å vedlikeholde 250 oppføringer per locale.
export const ALL_ISO_ALPHA2: readonly string[] = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS',
  'BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW',
  'CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT',
  'GU','GW','GY',
  'HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS',
  'MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS',
  'ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ',
  'VA','VC','VE','VG','VI','VN','VU',
  'WF','WS',
  'YE','YT',
  'ZA','ZM','ZW',
]

export interface CountryOption {
  code: string
  label: string
}

const DEFAULT_FAVORITES = ['NO', 'SE', 'LT', 'GB', 'US']

const cache = new Map<string, CountryOption[]>()

// Bygger en sortert, lokalisert landsliste. Favoritter (vanligste markeder)
// pinnes øverst og vises i deres opprinnelige rekkefølge — resten kommer
// alfabetisk under, sortert i samme locale.
export function getCountryOptions(
  locale: string,
  favorites: readonly string[] = DEFAULT_FAVORITES,
): CountryOption[] {
  const cacheKey = `${locale}|${favorites.join(',')}`
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const dn = new Intl.DisplayNames([locale], { type: 'region' })
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })

  const labelFor = (code: string): string => {
    try {
      return dn.of(code) ?? code
    } catch {
      return code
    }
  }

  const favSet = new Set(favorites)
  const favoritesList: CountryOption[] = favorites.map(code => ({
    code,
    label: labelFor(code),
  }))

  const rest: CountryOption[] = ALL_ISO_ALPHA2
    .filter(code => !favSet.has(code))
    .map(code => ({ code, label: labelFor(code) }))
    .sort((a, b) => collator.compare(a.label, b.label))

  const result = [...favoritesList, ...rest]
  cache.set(cacheKey, result)
  return result
}

// Henter et lokalisert navn for én kode (brukes f.eks. til pin-tooltip).
export function getCountryLabel(code: string | null | undefined, locale: string): string {
  if (!code) return ''
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

// Senterpunkt for kart-zoom når et land er valgt men ingen koordinater er
// satt enda. Vi har ikke alle 250, men de viktigste markedene + de
// utenom-europeiske som dukker opp først. Default-fallback er Europa.
export const COUNTRY_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  NO: { lat: 64.5, lng: 11.5, zoom: 4 },
  SE: { lat: 62.0, lng: 15.0, zoom: 4 },
  DK: { lat: 56.0, lng: 10.5, zoom: 6 },
  FI: { lat: 64.0, lng: 26.0, zoom: 4 },
  IS: { lat: 64.9, lng: -19.0, zoom: 6 },
  FO: { lat: 62.0, lng: -6.78, zoom: 8 },
  GL: { lat: 72.0, lng: -40.0, zoom: 3 },
  GB: { lat: 54.0, lng: -2.5, zoom: 5 },
  IE: { lat: 53.4, lng: -8.0, zoom: 6 },
  DE: { lat: 51.0, lng: 10.0, zoom: 5 },
  FR: { lat: 46.5, lng: 2.5, zoom: 5 },
  ES: { lat: 40.0, lng: -3.7, zoom: 5 },
  PT: { lat: 39.6, lng: -8.0, zoom: 6 },
  IT: { lat: 42.8, lng: 12.5, zoom: 5 },
  NL: { lat: 52.2, lng: 5.3, zoom: 7 },
  BE: { lat: 50.5, lng: 4.5, zoom: 7 },
  LU: { lat: 49.8, lng: 6.1, zoom: 9 },
  AT: { lat: 47.5, lng: 14.5, zoom: 6 },
  CH: { lat: 46.8, lng: 8.2, zoom: 7 },
  PL: { lat: 52.0, lng: 19.5, zoom: 5 },
  CZ: { lat: 49.8, lng: 15.5, zoom: 6 },
  SK: { lat: 48.7, lng: 19.5, zoom: 6 },
  HU: { lat: 47.2, lng: 19.5, zoom: 6 },
  EE: { lat: 58.7, lng: 25.5, zoom: 6 },
  LV: { lat: 56.9, lng: 24.6, zoom: 6 },
  LT: { lat: 55.3, lng: 23.9, zoom: 6 },
  RU: { lat: 60.0, lng: 60.0, zoom: 3 },
  UA: { lat: 49.0, lng: 32.0, zoom: 5 },
  US: { lat: 39.0, lng: -97.0, zoom: 3 },
  CA: { lat: 56.0, lng: -96.0, zoom: 3 },
  MX: { lat: 23.5, lng: -102.5, zoom: 4 },
  BR: { lat: -10.0, lng: -55.0, zoom: 3 },
  AR: { lat: -38.0, lng: -64.0, zoom: 3 },
  ZA: { lat: -29.0, lng: 24.0, zoom: 5 },
  EG: { lat: 26.0, lng: 30.0, zoom: 5 },
  AE: { lat: 24.0, lng: 54.0, zoom: 6 },
  SA: { lat: 24.0, lng: 45.0, zoom: 5 },
  IN: { lat: 22.0, lng: 79.0, zoom: 4 },
  CN: { lat: 35.0, lng: 105.0, zoom: 3 },
  JP: { lat: 36.5, lng: 138.0, zoom: 5 },
  KR: { lat: 36.5, lng: 127.8, zoom: 6 },
  TH: { lat: 15.0, lng: 101.0, zoom: 5 },
  VN: { lat: 16.0, lng: 107.0, zoom: 5 },
  AU: { lat: -25.0, lng: 134.0, zoom: 4 },
  NZ: { lat: -41.0, lng: 174.0, zoom: 5 },
}

export const EUROPE_DEFAULT_VIEW = { lat: 55, lng: 15, zoom: 4 } as const
