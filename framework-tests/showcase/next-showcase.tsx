/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
"use client";

// react-bkoi-gl v3 full-API showcase — Next.js App Router (TSX).
import { useEffect, useRef, useState } from 'react'
import type { MapRef } from 'react-bkoi-gl'
import {
  Map, Marker, Popup, Source, Layer, CanvasSource, DrawControl, GlobeControl,
  MinimapControl, NavigationControl, ScaleControl, FullscreenControl,
  GeolocateControl, AttributionControl, LogoControl, TerrainControl,
  MapProvider, useMap, useControl, getVersion, setLogger, GPUInitializationError,
} from 'react-bkoi-gl'
import 'react-bkoi-gl/styles'

const API_KEY = process.env.NEXT_PUBLIC_BARIKOI_API_KEY
const STYLE_URL = `https://map.barikoi.com/styles/osm-liberty/style.json?key=${API_KEY}`
const DHAKA = { longitude: 90.3938, latitude: 23.8216, zoom: 12 }
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const GEOJSON: any = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Point A' }, geometry: { type: 'Point', coordinates: [90.3938, 23.8216] } },
    { type: 'Feature', properties: { name: 'Point B' }, geometry: { type: 'Point', coordinates: [90.4, 23.83] } },
  ],
}

// Server-safe: App Router prerenders "use client" components on the server,
// so module-level window access must be guarded (flags written here land on
// the client copy; the server throwaway object is never read by the verifier).
const w: any = typeof window !== 'undefined' ? window : {}
const S: Record<string, any> = (w.__SHOWCASE = w.__SHOWCASE || {
  version6: false, logger: false, gpuError: false, customControl: false,
  marker: false, popup: false, sourceLayer: false, canvasSource: false,
  useMap: false, mapRef: false, terrain: false, globe: false, draw: false,
  minimap: false, drawCreate: 0, drawUpdate: 0, drawDelete: 0,
  warnings: [], errors: [],
})
const flag = (k: string, v: any = true) => { S[k] = v }

try {
  setLogger({

    warn: (m: any) => S.warnings.push(String(m?.message ?? m)),
    error: (m: any) => S.errors.push(String(m?.message ?? m)),
  })
  flag('logger')
} catch (e) { S.errors.push(`setLogger: ${e}`) }
flag('gpuError', typeof GPUInitializationError === 'function')
try { flag('version6', /^6\./.test(getVersion())) } catch (e) { S.errors.push(`getVersion: ${e}`) }

function MountFlag({ name, children }: { name: string; children: React.ReactNode }) {
  useEffect(() => flag(name), [])
  return <>{children}</>
}

function CustomControl() {
  useControl(
    () => ({
      onAdd: () => {
        const el = document.createElement('div')
        el.setAttribute('data-testid', 'custom-control')
        el.textContent = 'bkoi'
        flag('customControl')
        return el
      },
      onRemove: () => {},
    }),
    { position: 'top-left' }
  )
  return null
}

// useMap from OUTSIDE <Map>, via MapProvider (README hooks contract).
function OutsideProbe() {
  const { current: map } = useMap()
  useEffect(() => { if (map) flag('useMap') }, [map])
  return null
}

export default function Showcase() {
  const mapRef = useRef<MapRef | null>(null)
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 256
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 256, 256)
    g.addColorStop(0, '#f42a41'); g.addColorStop(1, '#006a4e')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
    setCanvasEl(c)
  }, [])

  return (
    <MapProvider>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <Map
          ref={mapRef as any}
          mapStyle={STYLE_URL}
          initialViewState={DHAKA}
          style={{ width: '100%', height: '100%' }}
          onLoad={(e: any) => {
            w.__READY = true
            w.__MAP = e.target
            const m = mapRef.current?.getMap() as any
            const dem = !!(m && m.getSource && m.getSource('terrain-dem'))
            const lyr = !!(m && m.getLayer && m.getLayer('points-layer'))
            flag('mapRef', !!m)
            flag('terrain', dem)
            flag('sourceLayer', lyr)
          }}
          onIdle={() => { w.__IDLE = true }}
          onError={(e: any) => { S.errors.push(String(e?.error?.message ?? e)); w.__MAP_ERROR = true }}
          onWarning={(e: any) => S.warnings.push(String(e?.message ?? e))}
        >
          {/* controls */}
          <NavigationControl position="top-right" showCompass showZoom />
          <ScaleControl position="bottom-left" unit="metric" maxWidth={150} />
          <FullscreenControl position="top-right" />
          <GeolocateControl position="top-right" showAccuracyCircle />
          <AttributionControl position="bottom-right" />
          <LogoControl position="bottom-left" />
          <CustomControl />
          <TerrainControl position="top-right" source="terrain-dem" />
          <MountFlag name="globe">
            <GlobeControl position="top-right" />
          </MountFlag>
          <MountFlag name="draw">
            <DrawControl
              position="top-left"
              controls={{ polygon: true, line_string: true, point: true, trash: true }}
              onDrawCreate={() => { S.drawCreate += 1 }}
              onDrawUpdate={() => { S.drawUpdate += 1 }}
              onDrawDelete={() => { S.drawDelete += 1 }}
            />
          </MountFlag>
          <MountFlag name="minimap">
            <MinimapControl position="bottom-right" zoomAdjust={-5} containerStyle={{ width: "180px", height: "130px" }} />
          </MountFlag>

          {/* marker + popup */}
          <MountFlag name="marker">
            <Marker longitude={90.3938} latitude={23.8216} color="red" />
            <Marker longitude={90.4} latitude={23.83}>
              <div style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>custom</div>
            </Marker>
          </MountFlag>
          <MountFlag name="popup">
            <Popup longitude={90.3938} latitude={23.8216} anchor="bottom" closeOnClick={false}>
              <div>Dhaka — react-bkoi-gl showcase</div>
            </Popup>
          </MountFlag>

          {/* sources + layers */}
          <Source id="points" type="geojson" data={GEOJSON}>
            <Layer id="points-layer" type="circle" paint={{ 'circle-radius': 10, 'circle-color': '#007cbf' }} />
          </Source>
          <Source id="terrain-dem" type="raster-dem" tiles={[TERRARIUM]} encoding="terrarium" tileSize={256} maxzoom={15} />

          {canvasEl && (
            <MountFlag name="canvasSource">
              <CanvasSource
                id="my-canvas"
                canvas={canvasEl}
                coordinates={[[90.38, 23.83], [90.41, 23.83], [90.41, 23.81], [90.38, 23.81]]}
                animate={false}
              >
                <Layer type="raster" paint={{ 'raster-opacity': 0.8 }} />
              </CanvasSource>
            </MountFlag>
          )}
        </Map>
        <OutsideProbe />
      </div>
    </MapProvider>
  )
}
