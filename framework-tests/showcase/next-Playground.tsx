/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
"use client";

// react-bkoi-gl v3 MANUAL playground — every public API, tabbed for hands-on testing.
// Tabs via URL hash (#map, #controls, #marker, #sources, #draw, #hooks).
import { useEffect, useRef, useState } from 'react'
import type { MapRef } from 'react-bkoi-gl'
import {
  Map, Marker, Popup, Source, Layer, CanvasSource, DrawControl, GlobeControl,
  MinimapControl, NavigationControl, ScaleControl, FullscreenControl,
  GeolocateControl, AttributionControl, LogoControl, TerrainControl,
  MapProvider, useMap, useControl, getVersion, getWorkerUrl, setLogger,
  GPUInitializationError,
} from 'react-bkoi-gl'
import 'react-bkoi-gl/styles'

const API_KEY = process.env.NEXT_PUBLIC_BARIKOI_API_KEY
const STYLE_URL = `https://map.barikoi.com/styles/osm-liberty/style.json?key=${API_KEY}`
const DHAKA = { longitude: 90.3938, latitude: 23.8216, zoom: 12 }
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const ENGINE = {
  version: (() => { try { return getVersion() } catch { return '?' } })(),
  gpuError: typeof GPUInitializationError === 'function',
}

const LOGS: { warnings: string[]; errors: string[] } = { warnings: [], errors: [] }
setLogger({
  warn: (m: any) => { LOGS.warnings.push(String(m?.message ?? m)); document.dispatchEvent(new CustomEvent('bkoi-log')) },
  error: (m: any) => { LOGS.errors.push(String(m?.message ?? m)); document.dispatchEvent(new CustomEvent('bkoi-log')) },
})

const GEOJSON: any = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Point A' }, geometry: { type: 'Point', coordinates: [90.3938, 23.8216] } },
    { type: 'Feature', properties: { name: 'Point B' }, geometry: { type: 'Point', coordinates: [90.4, 23.83] } },
  ],
}
const POLYGON: any = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[90.38, 23.81], [90.41, 23.81], [90.41, 23.84], [90.38, 23.84], [90.38, 23.81]]] },
}

const TABS = ['map', 'controls', 'marker', 'sources', 'draw', 'hooks']
function useHashTab() {
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' ? (location.hash || '#map').slice(1) : 'map'))
  useEffect(() => {
    const on = () => setTab((location.hash || '#map').slice(1))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return tab
}

function TopBar() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t: number) => t + 1)
    document.addEventListener('bkoi-log', on)
    return () => document.removeEventListener('bkoi-log', on)
  }, [])
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: '#111', color: '#fff', fontSize: 12, padding: '4px 10px', display: 'flex', gap: 14, alignItems: 'center' }}>
      {TABS.map((t) => <a key={t} href={`#${t}`} style={{ color: '#7fd4ff', textDecoration: 'none' }}>{t}</a>)}
      <span style={{ marginLeft: 'auto' }}>engine v{ENGINE.version} · gpuErr={String(ENGINE.gpuError)} · ⚠{LOGS.warnings.length} ✖{LOGS.errors.length}</span>
    </div>
  )
}

function LogPanel() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t: number) => t + 1)
    document.addEventListener('bkoi-log', on)
    return () => document.removeEventListener('bkoi-log', on)
  }, [])
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(0,0,0,.85)', color: '#ffd', fontSize: 11, padding: '4px 10px', maxHeight: 90, overflow: 'auto' }}>
      <b>warnings:</b> {LOGS.warnings.slice(-3).join(' | ') || '—'}<br />
      <b>errors:</b> {LOGS.errors.slice(-3).join(' | ') || '—'}
    </div>
  )
}

// ---- tab 1: map core -----------------------------------------------------
function MapTab() {
  const ref = useRef<MapRef | null>(null)
  const [info, setInfo] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const note = (e: string) => setEvents((v) => [...v.slice(-4), e])
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="map-ui" style={{ position: 'absolute', top: 30, left: 8, zIndex: 5, display: 'flex', gap: 6 }}>
        <button onClick={() => ref.current?.getMap()?.zoomIn()}>zoomIn()</button>
        <button onClick={() => ref.current?.getMap()?.zoomOut()}>zoomOut()</button>
        <button onClick={() => ref.current?.getMap()?.flyTo({ center: [90.4, 23.83], zoom: 15, duration: 600 })}>flyTo()</button>
        <button onClick={() => { const m = ref.current?.getMap(); if (m) setInfo(`${m.getCenter().lng.toFixed(4)}, ${m.getCenter().lat.toFixed(4)} z${m.getZoom().toFixed(2)} b${m.getBearing().toFixed(0)} p${m.getPitch().toFixed(0)}`) }}>getCenter()</button>
        <span>{info}</span>
      </div>
      <Map
        ref={ref as any}
        mapStyle={STYLE_URL}
        initialViewState={DHAKA}
        style={{ width: '100%', height: '100%' }}
        onLoad={() => note('load')}
        onIdle={() => note('idle')}
        onError={(e: any) => note(`error: ${e?.error?.message ?? e}`)}
        onWarning={(e: any) => note(`warning: ${e?.message ?? e}`)}
      />
      <div style={{ position: 'absolute', bottom: 96, right: 8, zIndex: 5, fontSize: 11 }}>events: {events.join(' → ') || '—'}</div>
    </div>
  )
}

// ---- tab 2: all controls -------------------------------------------------
function ControlsTab() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="map-ui" style={{ position: 'absolute', top: 30, left: 8, zIndex: 5, display: 'flex', gap: 6 }}>
        <span style={{ fontSize: 12 }}>open the geolocate button on the map (browser will prompt)</span>
      </div>
      <Map mapStyle={STYLE_URL} initialViewState={DHAKA} style={{ width: '100%', height: '100%' }}>
        <NavigationControl position="top-right" showCompass showZoom visualizePitch />
        <FullscreenControl position="top-right" />
        <GeolocateControl position="top-right" trackUserLocation showAccuracyCircle />
        <GlobeControl position="top-right" />
        <TerrainControl position="top-right" source="terrain-dem" />
        <ScaleControl position="bottom-left" unit="metric" maxWidth={150} />
        <LogoControl position="bottom-left" />
        <AttributionControl position="bottom-right" />
        <MinimapControl position="bottom-right" zoomAdjust={-5} toggleable initialMinimized={false}
          containerStyle={{ width: "180px", height: "130px" }} />
        <Source id="terrain-dem" type="raster-dem" tiles={[TERRARIUM]} encoding="terrarium" tileSize={256} maxzoom={15} />
      </Map>
    </div>
  )
}

// ---- tab 3: marker + popup -----------------------------------------------
function MarkerTab() {
  const [pos, setPos] = useState({ lng: 90.4, lat: 23.83 })
  const [show, setShow] = useState(true)
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="map-ui" style={{ position: 'absolute', top: 30, left: 8, zIndex: 5, display: 'flex', gap: 6 }}>
        <button onClick={() => setShow((s) => !s)}>{show ? 'hide popup' : 'show popup'}</button>
        <span>{`dragged: ${pos.lng.toFixed(4)}, ${pos.lat.toFixed(4)}`}</span>
      </div>
      <Map mapStyle={STYLE_URL} initialViewState={DHAKA} style={{ width: '100%', height: '100%' }}>
        <Marker longitude={90.3938} latitude={23.8216} color="red" />
        <Marker longitude={pos.lng} latitude={pos.lat} color="blue" draggable
          onDragEnd={(e: any) => setPos({ lng: e.lngLat.lng, lat: e.lngLat.lat })} />
        <Marker longitude={90.42} latitude={23.84}>
          <div style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>custom HTML</div>
          <Popup longitude={90.42} latitude={23.84} closeButton={false} anchor="bottom"><div>marker-attached popup</div></Popup>
        </Marker>
        {show && (
          <Popup longitude={90.3938} latitude={23.8216} anchor="bottom" closeOnClick={false}
            onClose={() => setShow(false)}>
            <div><b>Dhaka</b><br />controlled popup</div>
          </Popup>
        )}
      </Map>
    </div>
  )
}

// ---- tab 4: sources & layers ---------------------------------------------
function SourcesTab() {
  const [alt, setAlt] = useState(false)
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const [clicked, setClicked] = useState('')
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="map-ui" style={{ position: 'absolute', top: 30, left: 8, zIndex: 5, display: 'flex', gap: 6 }}>
        <button onClick={() => setAlt((a) => !a)}>{alt ? 'data: set A' : 'data: set B'}</button>
        <span>picked: {clicked || '—'}</span>
      </div>
      <Map mapStyle={STYLE_URL} initialViewState={{ longitude: 90.4, latitude: 23.83, zoom: 12 }} style={{ width: '100%', height: '100%' }}
        onClick={(e: any) => { const f = e.target?.queryRenderedFeatures?.(e.point, { layers: ['points-layer'] }); setClicked(f?.[0]?.properties?.name ?? '') }}>
        <Source id="points" type="geojson" data={alt ? POLYGON : GEOJSON}>
          {alt
            ? <Layer id="points-layer" type="fill" paint={{ 'fill-color': '#088', 'fill-opacity': 0.4 }} />
            : <Layer id="points-layer" type="circle" paint={{ 'circle-radius': 10, 'circle-color': '#007cbf' }} />}
        </Source>
        {canvasEl && (
          <CanvasSource id="my-canvas" canvas={canvasEl} animate
            coordinates={[[90.38, 23.83], [90.41, 23.83], [90.41, 23.81], [90.38, 23.81]]}>
            <Layer type="raster" paint={{ 'raster-opacity': 0.8 }} />
          </CanvasSource>
        )}
      </Map>
    </div>
  )
}

// ---- tab 5: draw ----------------------------------------------------------
function DrawTab() {
  const [n, setN] = useState({ create: 0, update: 0, delete: 0, mode: '—' })
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="map-ui" style={{ position: 'absolute', top: 30, left: 8, zIndex: 5, fontSize: 13 }}>
        create {n.create} · update {n.update} · delete {n.delete} · mode {n.mode} (draw with the toolbar)
      </div>
      <Map mapStyle={STYLE_URL} initialViewState={DHAKA} style={{ width: '100%', height: '100%' }}>
        <DrawControl
          position="top-left"
          controls={{ polygon: true, line_string: true, point: true, trash: true }}
          defaultMode="simple_select"
          onDrawCreate={() => setN((v) => ({ ...v, create: v.create + 1 }))}
          onDrawUpdate={() => setN((v) => ({ ...v, update: v.update + 1 }))}
          onDrawDelete={() => setN((v) => ({ ...v, delete: v.delete + 1 }))}
          onDrawModeChange={(e: any) => setN((v) => ({ ...v, mode: e.mode }))}
        />
      </Map>
    </div>
  )
}

// ---- tab 6: hooks & custom control ---------------------------------------
function ZoomButtons() {
  const { current: map } = useMap()
  return (
    <div style={{ position: 'absolute', top: 30, right: 8, zIndex: 5, display: 'flex', gap: 6 }}>
      <button onClick={() => map?.zoomIn()}>useMap zoomIn</button>
      <button onClick={() => map?.flyTo({ center: [90.4, 23.83], zoom: 15 })}>useMap flyTo</button>
    </div>
  )
}
function CustomControl() {
  useControl(() => ({
    onAdd: () => {
      const el = document.createElement('div')
      el.textContent = 'custom IControl'
      el.style.cssText = 'background:#fff;padding:2px 8px;border-radius:4px;font-size:12px'
      return el
    },
    onRemove: () => {},
  }), { position: 'top-left' })
  return null
}
function HooksTab() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map mapStyle={STYLE_URL} initialViewState={DHAKA} style={{ width: '100%', height: '100%' }}>
        <CustomControl />
      </Map>
      <MapProvider>
        <ZoomButtons />
      </MapProvider>
    </div>
  )
}

export default function Playground() {
  const tab = useHashTab()
  return (
    <div style={{ width: '100vw', height: '100vh', paddingTop: 24 }}>
      <TopBar />
      {tab === 'controls' ? <ControlsTab />
        : tab === 'marker' ? <MarkerTab />
        : tab === 'sources' ? <SourcesTab />
        : tab === 'draw' ? <DrawTab />
        : tab === 'hooks' ? <HooksTab />
        : <MapTab />}
      <LogPanel />
    </div>
  )
}
