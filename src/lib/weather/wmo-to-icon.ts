import {
  Sun, CloudSun, Cloud, Cloudy, CloudFog,
  CloudDrizzle, CloudRain, CloudRainWind,
  CloudSnow, CloudLightning, CloudHail,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface WeatherDescriptor {
  icon: LucideIcon
  /** Norsk kortbeskrivelse — vises kun på md/lg-størrelser. */
  label: string
  /** Driver Ember-fargestyring i WeatherInline. True når tempC ≥ 18. */
  warm: boolean
}

/**
 * WMO weather code → ikon + norsk kort­beskrivelse. Følger Open-Meteo's
 * kodetabell. Ukjente koder faller tilbake til en generisk skye-glyf
 * heller enn å skjule visningen — kjent ikon > tom plass på TV.
 */
export function wmoToIcon(code: number, tempC: number): WeatherDescriptor {
  const warm = tempC >= 18

  switch (code) {
    case 0:
      return { icon: Sun, label: 'Klart vær', warm }
    case 1: case 2:
      return { icon: CloudSun, label: 'Lettskyet', warm }
    case 3:
      return { icon: Cloudy, label: 'Overskyet', warm: false }
    case 45: case 48:
      return { icon: CloudFog, label: 'Tåke', warm: false }
    case 51: case 53: case 55:
    case 56: case 57:
      return { icon: CloudDrizzle, label: 'Yr', warm: false }
    case 61: case 63:
    case 66: case 67:
    case 80: case 81:
      return { icon: CloudRain, label: 'Regn', warm: false }
    case 65: case 82:
      return { icon: CloudRainWind, label: 'Kraftig regn', warm: false }
    case 71: case 73: case 75:
    case 77: case 85: case 86:
      return { icon: CloudSnow, label: 'Snø', warm: false }
    case 95:
      return { icon: CloudLightning, label: 'Torden', warm: false }
    case 96: case 99:
      return { icon: CloudHail, label: 'Torden med hagl', warm: false }
    default:
      return { icon: Cloud, label: 'Skyet', warm: false }
  }
}
