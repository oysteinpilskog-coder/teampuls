'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { COUNTRY_CENTERS, EUROPE_DEFAULT_VIEW } from '@/lib/countries'
import 'leaflet/dist/leaflet.css'

interface CoordsMapPickerProps {
  lat: number | null
  lng: number | null
  countryCode?: string | null
  onChange: (lat: number, lng: number) => void
  height?: number
}

// Custom DivIcon med Offiview-pin. Unngår de kjente broken-paths-problemene
// med Leaflets default-marker når Webpack/Next pakker assets.
const PIN_HTML = `
<div style="
  position: relative;
  width: 26px;
  height: 36px;
  transform: translate(-50%, -100%);
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
">
  <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 0C5.82 0 0 5.82 0 13c0 9.75 13 23 13 23s13-13.25 13-23C26 5.82 20.18 0 13 0z"
      fill="#FF7A1A"/>
    <circle cx="13" cy="13" r="5" fill="white"/>
  </svg>
</div>
`

function buildIcon(): L.DivIcon {
  return L.divIcon({
    className: 'tp-coords-pin',
    html: PIN_HTML,
    iconSize: [26, 36],
    iconAnchor: [13, 36],
  })
}

function MapClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Når lat/lng eller land endres utenfor kartet (f.eks. via geocoding eller
// manuell input), sentrerer vi/zoomer kartet smooth.
function MapSync({
  lat,
  lng,
  countryCode,
}: {
  lat: number | null
  lng: number | null
  countryCode?: string | null
}) {
  const map = useMap()
  const lastLat = useRef<number | null>(null)
  const lastLng = useRef<number | null>(null)
  const lastCountry = useRef<string | null | undefined>(countryCode)

  useEffect(() => {
    if (lat != null && lng != null) {
      const moved =
        lastLat.current == null ||
        lastLng.current == null ||
        Math.abs(lastLat.current - lat) > 1e-5 ||
        Math.abs(lastLng.current - lng) > 1e-5
      if (moved) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.6 })
      }
      lastLat.current = lat
      lastLng.current = lng
      lastCountry.current = countryCode
      return
    }
    // Ingen pin satt — zoom til land hvis det er valgt og er endret.
    if (countryCode && countryCode !== lastCountry.current) {
      const center = COUNTRY_CENTERS[countryCode]
      if (center) {
        map.flyTo([center.lat, center.lng], center.zoom, { duration: 0.6 })
      }
      lastCountry.current = countryCode
    }
  }, [lat, lng, countryCode, map])

  return null
}

export function CoordsMapPicker({
  lat,
  lng,
  countryCode,
  onChange,
  height = 260,
}: CoordsMapPickerProps) {
  const icon = useMemo(() => buildIcon(), [])

  const initialCenter = useMemo<[number, number]>(() => {
    if (lat != null && lng != null) return [lat, lng]
    if (countryCode && COUNTRY_CENTERS[countryCode]) {
      const c = COUNTRY_CENTERS[countryCode]
      return [c.lat, c.lng]
    }
    return [EUROPE_DEFAULT_VIEW.lat, EUROPE_DEFAULT_VIEW.lng]
  }, [lat, lng, countryCode])

  const initialZoom = useMemo(() => {
    if (lat != null && lng != null) return 13
    if (countryCode && COUNTRY_CENTERS[countryCode]) return COUNTRY_CENTERS[countryCode].zoom
    return EUROPE_DEFAULT_VIEW.zoom
  }, [lat, lng, countryCode])

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border-subtle)',
        height,
        backgroundColor: 'var(--bg-subtle)',
      }}
    >
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onChange={onChange} />
        <MapSync lat={lat} lng={lng} countryCode={countryCode} />
        {lat != null && lng != null && (
          <Marker
            position={[lat, lng]}
            icon={icon}
            draggable
            eventHandlers={{
              dragend(e) {
                const m = e.target as L.Marker
                const pos = m.getLatLng()
                onChange(pos.lat, pos.lng)
              },
            }}
          />
        )}
      </MapContainer>

      <div
        className="pointer-events-none absolute top-2 left-2 px-2.5 py-1 rounded-lg text-[11px] font-medium"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          color: 'white',
          fontFamily: 'var(--font-body)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {lat != null && lng != null
          ? 'Dra pinnen eller klikk for å justere'
          : 'Klikk på kartet for å plassere pin'}
      </div>
    </div>
  )
}

export default CoordsMapPicker
