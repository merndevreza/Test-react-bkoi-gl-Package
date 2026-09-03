# react-bkoi-gl v3 Framework Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove `react-bkoi-gl` 3.0.0 works end-to-end (install → dev → prod build → headless render + full-API showcase) in the 9 test projects: Vite 5/6/7/8-yarn, Next 15/16 × webpack/turbopack, CRA 5.

**Architecture:** A new `framework-tests/` harness at the repo root installs the **packed tarball** of the library into each project, replaces each project's entry component with a full-API showcase (same checklist everywhere, per-framework env prefix), then a Playwright verifier asserts: worker constructed + HTTP 200, `__READY`, `__IDLE`, `__SHOWCASE` flags all true, required DOM present, zero page/map errors. A single runner orchestrates all projects serially and emits `RESULTS.md`.

**Tech Stack:** npm/yarn1, Playwright (headless Chromium), plain Node ESM scripts (no framework in the harness).

**Notes for the executor:**
- Root `/Users/barikoi/Desktop/BKoi-GL-Test` is NOT a git repo; each project has its own `.git` belonging to the user. **Do not commit anywhere** — this is the user's scratch/test area.
- API key (user-supplied, plaintext on disk approved): `MjA5NTpRSllMQU5VS0k2`. Never write it to memory files or commit it.
- Long installs are expected. Run heavy steps via Bash `run_in_background` where sensible and poll.
- All prop shapes below were verified against `react-bkoi-gl/tests/e2e/app/cases/*` and `tests/framework/*` — copy them exactly.

**Verified environment facts:**
- Node v20.20.2, npm 10.8.2, `yarn --version` → 4.18.0 (berry) → the `vite-yarn` project must use `npx -y yarn@1.22.22` (classic).
- Library `react-bkoi-gl/` has NO `node_modules` and NO `dist` yet.
- Playwright 1.62.1 is a devDep of the library.
- Next app-dir locations: `next15-webpack/app`, `next15-turbopack/src/app`, `next16-webpack/src/app`, `next16-turbopack/app`.
- Project versions: vite5-react = Vite 5 + React 18.3.1; vite6 = Vite 6.3.5; vite7 = Vite 7; vite-yarn = Vite 8.2.2; next15-* = Next 15.5.25 + React 19.1.0; next16-* = Next 16.3.4 + React 19.2.8; cra-react = react-scripts 5.0.1 + React 19.2.8.

---

### Task 1: Harness scaffold — `framework-tests/` with verify.mjs + self-test

**Files:**
- Create: `framework-tests/package.json`
- Create: `framework-tests/lib.mjs`
- Create: `framework-tests/verify.mjs`
- Create: `framework-tests/selftest/index.html`
- Create: `framework-tests/selftest/worker.js`

- [ ] **Step 1: Create the harness package + shared helpers**

`framework-tests/package.json`:

```json
{
  "name": "framework-tests",
  "private": true,
  "type": "module",
  "devDependencies": {
    "playwright": "1.62.1"
  }
}
```

`framework-tests/lib.mjs` (static server, wait-up, port killer, shell helpers):

```js
import { execSync, spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '..')
export const LIB_DIR = path.join(ROOT, 'react-bkoi-gl')

export const sh = (cmd, cwd, timeoutMs = 600_000, env = process.env) =>
  execSync(cmd, { cwd, stdio: 'inherit', timeout: timeoutMs, env })

export const shAsync = (cmd, cwd, timeoutMs = 600_000, env = process.env) =>
  new Promise((resolve) => {
    const child = spawn(cmd, { cwd, stdio: 'inherit', timeout: timeoutMs, env, shell: true })
    const t = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('exit', (code) => { clearTimeout(t); resolve(code === 0) })
    child.on('error', () => { clearTimeout(t); resolve(false) })
  })

export function killPort(port) {
  try { execSync(`lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill -9`, { stdio: 'ignore' }) } catch {}
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.map': 'application/json',
  '.wasm': 'application/wasm',
}

export function serveStatic(root, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath)
    if (!file.startsWith(root)) { res.writeHead(403); return res.end() }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

export async function waitUp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.status < 500) return true } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

/** Spawn a long-lived server process. Returns { url, stop }. */
export function startServer(cmd, cwd, port, env = {}) {
  killPort(port)
  const child = spawn(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...env }, shell: true, detached: true })
  const url = `http://localhost:${port}/`
  return {
    url,
    stop: async () => {
      try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
      await new Promise((r) => { child.on('exit', r); setTimeout(r, 3000) })
      killPort(port)
    },
  }
}
```

- [ ] **Step 2: Write the self-test fixture FIRST (defines what verify.mjs must assert)**

`framework-tests/selftest/index.html`:

```html
<!doctype html>
<html>
<body>
<script>
  window.__SHOWCASE = {
    version6: true, logger: true, gpuError: true, customControl: true,
    marker: true, popup: true, sourceLayer: true, canvasSource: true,
    useMap: true, mapRef: true, terrain: true, globe: true, draw: true,
    minimap: true, drawCreate: 0, drawUpdate: 0, drawDelete: 0,
    warnings: [], errors: []
  }
  window.__MAP = { getSource: () => ({}), getLayer: () => ({}) }
  new Worker('worker.js')
  setTimeout(() => { window.__READY = true; window.__IDLE = true }, 300)
</script>
<canvas class="maplibregl-canvas"></canvas>
<div class="maplibregl-marker"></div>
<div class="maplibregl-popup"></div>
<div class="maplibregl-ctrl-scale"></div>
<div class="maplibregl-ctrl-attrib"></div>
<a class="maplibregl-ctrl-logo"></a>
<div data-testid="custom-control"></div>
</body>
</html>
```

`framework-tests/selftest/worker.js`:

```js
self.onmessage = () => {}
```

- [ ] **Step 3: Write verify.mjs (the verifier all cells share)**

`framework-tests/verify.mjs`:

```js
/**
 * Headless verification of one app cell (dev server or prod build).
 * Asserts: Worker constructed + URL 200, __READY, __IDLE, __SHOWCASE
 * required flags all true, required DOM present, sources registered,
 * zero page errors / map errors. Draw toolbar interaction is best-effort
 * (informational: result.drawInteractive).
 *
 * Usage: node verify.mjs --name <label> --url <url> [--dev] [--out results.json]
 */
import fs from 'node:fs'
import { chromium } from 'playwright'
import { here, serveStatic } from './lib.mjs'
import path from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? d : process.argv[i + 1] }
const name = arg('name', 'app')
let url = arg('url')
const dir = arg('dir')
const port = Number(arg('port', 6499))
const isDev = process.argv.includes('--dev')
const outFile = arg('out')

let staticServer = null
if (!url && dir) { staticServer = await serveStatic(path.resolve(dir), port); url = `http://localhost:${port}/` }
if (!url) { console.error('verify: --url or --dir required'); process.exit(2) }

const REQUIRED = ['version6', 'logger', 'gpuError', 'customControl', 'marker', 'popup',
  'sourceLayer', 'canvasSource', 'useMap', 'mapRef', 'terrain', 'globe', 'draw', 'minimap']

const result = { name, url, ok: false, workers: [], workerStatus: null, ready: false, idle: false,
  showcase: null, missing: [], dom: {}, drawInteractive: null,
  mapErrors: [], pageErrors: [], consoleErrors: [] }

const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const Native = window.Worker
    window.__WORKERS = []
    window.Worker = class extends Native {
      constructor(u, o) { super(u, o); try { window.__WORKERS.push(String(u)) } catch {} }
    }
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => result.pageErrors.push(String(e?.message ?? e)))
  page.on('console', (m) => { if (m.type() === 'error') result.consoleErrors.push(m.text()) })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: isDev ? 180_000 : 90_000 })
  await page.waitForFunction(() => window.__IDLE === true, null, { timeout: isDev ? 150_000 : 75_000 }).catch(() => {})

  // Best-effort draw interaction: find a polygon tool button, draw a triangle.
  try {
    const btn = page.locator('button[class*="draw"][class*="polygon"], button[title*="olygon" i], button[aria-label*="olygon" i]').first()
    if ((await btn.count()) > 0 && (await btn.isVisible())) {
      const canvas = page.locator('canvas.maplibregl-canvas').first()
      await btn.click()
      await page.waitForTimeout(400)
      await canvas.click({ position: { x: 250, y: 250 } }); await page.waitForTimeout(350)
      await canvas.click({ position: { x: 330, y: 270 } }); await page.waitForTimeout(350)
      await canvas.click({ position: { x: 290, y: 190 } }); await page.waitForTimeout(350)
      await canvas.dblclick({ position: { x: 290, y: 190 } })
      await page.waitForTimeout(1000)
      result.drawInteractive = await page.evaluate(() => (window.__SHOWCASE || {}).drawCreate ?? null)
    } else {
      result.drawInteractive = 'polygon-button-not-found'
    }
  } catch (e) { result.drawInteractive = `interaction-error: ${String(e?.message ?? e).slice(0, 120)}` }

  result.ready = await page.evaluate(() => window.__READY === true)
  result.idle = await page.evaluate(() => window.__IDLE === true)
  result.workers = await page.evaluate(() => window.__WORKERS || [])
  if (result.workers.length) {
    result.workerStatus = await page.evaluate(async (urls) =>
      Promise.all(urls.map(async (u) => { try { return (await fetch(u)).status } catch { return 0 } })), result.workers)
  }
  result.showcase = await page.evaluate(() => window.__SHOWCASE || null)
  result.mapErrors = (result.showcase && result.showcase.errors) || []
  result.dom = await page.evaluate(() => {
    let sources = null
    try {
      const m = window.__MAP
      if (m) sources = { points: !!m.getSource('points'), dem: !!m.getSource('terrain-dem'), layer: !!m.getLayer('points-layer') }
    } catch {}
    return {
      canvas: !!document.querySelector('canvas.maplibregl-canvas'),
      markers: document.querySelectorAll('.maplibregl-marker').length,
      popup: !!document.querySelector('.maplibregl-popup'),
      scale: !!document.querySelector('.maplibregl-ctrl-scale'),
      attrib: !!document.querySelector('.maplibregl-ctrl-attrib'),
      logo: !!document.querySelector('a.maplibregl-ctrl-logo'),
      custom: !!document.querySelector('[data-testid="custom-control"]'),
      sources,
    }
  })

  result.missing = REQUIRED.filter((k) => !result.showcase || result.showcase[k] !== true)
  result.errors = [...result.mapErrors, ...result.pageErrors]
  const d = result.dom
  result.ok =
    result.workers.length > 0 &&
    (result.workerStatus || []).every((s) => s === 200) &&
    result.ready && result.idle &&
    result.missing.length === 0 &&
    result.errors.length === 0 &&
    d.canvas && d.markers >= 1 && d.popup && d.scale && d.attrib && d.logo && d.custom &&
    !!d.sources && d.sources.points && d.sources.layer
} finally {
  await browser.close()
  if (staticServer) await new Promise((r) => staticServer.close(r))
}

if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
console.log(`${result.ok ? 'PASS' : 'FAIL'} ${name} — workers=${result.workers.length}(${(result.workerStatus || []).join(',')}) ready=${result.ready} idle=${result.idle} missing=[${result.missing.join(',')}] dom={canvas:${result.dom.canvas} markers:${result.dom.markers} popup:${result.dom.popup} custom:${result.dom.custom}} errors=${result.errors.length} draw=${result.drawInteractive}`)
process.exit(result.ok ? 0 : 1)
```

- [ ] **Step 4: Install Playwright + Chromium**

Run:
```bash
cd /Users/barikoi/Desktop/BKoi-GL-Test/framework-tests && npm install && npx playwright install chromium
```
Expected: install succeeds; `node_modules/playwright` exists.

- [ ] **Step 5: Run the self-test (must PASS before anything else)**

Run:
```bash
cd /Users/barikoi/Desktop/BKoi-GL-Test/framework-tests && node verify.mjs --name selftest --dir selftest --out results-selftest.json
```
Expected: `PASS selftest — workers=1(200) ready=true idle=true missing=[] ... errors=0`. If FAIL, fix verify.mjs before proceeding.

---

### Task 2: Build the library and pack the tarball

**Files:** none created (build artifacts only)

- [ ] **Step 1: Install library devDependencies**

Run: `cd /Users/barikoi/Desktop/BKoi-GL-Test/react-bkoi-gl && npm install`
Expected: completes (several minutes; puppeteer/playwright downloads are expected).

- [ ] **Step 2: Build + pack**

Run:
```bash
cd /Users/barikoi/Desktop/BKoi-GL-Test/react-bkoi-gl && npm run build && mkdir -p ../framework-tests/tarballs && npm pack --pack-destination ../framework-tests/tarballs
```
Expected: `dist/` contains `index.js`, `index.cjs`, `index.d.ts`, `styles/react-bkoi-gl.css`, `bkoi-map-worker.mjs`; tarball `react-bkoi-gl-3.0.0.tgz` lands in `framework-tests/tarballs/`.

- [ ] **Step 3: Assert artifacts exist**

Run:
```bash
ls /Users/barikoi/Desktop/BKoi-GL-Test/react-bkoi-gl/dist/bkoi-map-worker.mjs /Users/barikoi/Desktop/BKoi-GL-Test/react-bkoi-gl/dist/styles/react-bkoi-gl.css /Users/barikoi/Desktop/BKoi-GL-Test/framework-tests/tarballs/react-bkoi-gl-3.0.0.tgz
```
Expected: all three paths listed. If `bkoi-map-worker.mjs` is missing, STOP — the whole matrix depends on the self-contained worker.

---

### Task 3: Canonical showcase sources (3 framework families)

**Files:**
- Create: `framework-tests/showcase/vite-App.jsx` (copied verbatim to vite5/6/7 `src/App.jsx`)
- Create: `framework-tests/showcase/next-showcase.tsx` (copied to each Next `app/`-or-`src/app/showcase.tsx`)
- Create: `framework-tests/showcase/cra-App.js` (copied to `cra-react/src/App.js`)

- [ ] **Step 1: Write the Vite-family showcase**

`framework-tests/showcase/vite-App.jsx`:

```jsx
// react-bkoi-gl v3 full-API showcase — Vite family (JSX).
import { useEffect, useRef, useState } from 'react'
import {
  Map, Marker, Popup, Source, Layer, CanvasSource, DrawControl, GlobeControl,
  MinimapControl, NavigationControl, ScaleControl, FullscreenControl,
  GeolocateControl, AttributionControl, LogoControl, TerrainControl,
  MapProvider, useMap, useControl, getVersion, setLogger, GPUInitializationError,
} from 'react-bkoi-gl'
import 'react-bkoi-gl/styles'

const API_KEY = import.meta.env.VITE_BARIKOI_API_KEY
const STYLE_URL = `https://map.barikoi.com/styles/osm-liberty/style.json?key=${API_KEY}`
const DHAKA = { longitude: 90.3938, latitude: 23.8216, zoom: 12 }
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Point A' }, geometry: { type: 'Point', coordinates: [90.3938, 23.8216] } },
    { type: 'Feature', properties: { name: 'Point B' }, geometry: { type: 'Point', coordinates: [90.4, 23.83] } },
  ],
}

// ---- flags -----------------------------------------------------------
const S = (window.__SHOWCASE = {
  version6: false, logger: false, gpuError: false, customControl: false,
  marker: false, popup: false, sourceLayer: false, canvasSource: false,
  useMap: false, mapRef: false, terrain: false, globe: false, draw: false,
  minimap: false, drawCreate: 0, drawUpdate: 0, drawDelete: 0,
  warnings: [], errors: [],
})
const flag = (k, v = true) => { S[k] = v }

try {
  setLogger({
    debug: () => {}, info: () => {},
    warn: (m) => S.warnings.push(String(m?.message ?? m)),
    error: (m) => S.errors.push(String(m?.message ?? m)),
  })
  flag('logger')
} catch (e) { S.errors.push(`setLogger: ${e}`) }
flag('gpuError', typeof GPUInitializationError === 'function')
try { flag('version6', /^6\./.test(getVersion())) } catch (e) { S.errors.push(`getVersion: ${e}`) }

// Sets a flag once the wrapped child has mounted (component constructed w/o throw).
function MountFlag({ name, children }) {
  useEffect(() => flag(name), [])
  return children
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

export default function App() {
  const mapRef = useRef(null)
  const [canvasEl, setCanvasEl] = useState(null)

  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 256
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 256, 256)
    g.addColorStop(0, '#f42a41'); g.addColorStop(1, '#006a4e')
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
    setCanvasEl(c)
  }, [])

  return (
    <MapProvider>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <Map
          ref={mapRef}
          mapStyle={STYLE_URL}
          initialViewState={DHAKA}
          style={{ width: '100%', height: '100%' }}
          onLoad={(e) => {
            window.__READY = true
            window.__MAP = e.target
            const m = mapRef.current?.getMap()
            const dem = !!(m && m.getSource && m.getSource('terrain-dem'))
            const lyr = !!(m && m.getLayer && m.getLayer('points-layer'))
            flag('mapRef', !!m)
            flag('terrain', dem)
            flag('sourceLayer', lyr)
          }}
          onIdle={() => { window.__IDLE = true }}
          onError={(e) => { S.errors.push(String(e?.error?.message ?? e)); window.__MAP_ERROR = true }}
          onWarning={(e) => S.warnings.push(String(e?.message ?? e))}
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
            <MinimapControl position="bottom-right" zoomAdjust={-5} containerStyle={{ width: 180, height: 130 }} />
          </MountFlag>

          {/* marker + popup */}
          <MountFlag name="marker">
            <Marker longitude={90.3938} latitude={23.8216} color="red" />
            <Marker longitude={90.4} latitude={23.83}>
              <div style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>custom</div>
            </Marker>
          </MountFlag>
          <MountFlag name="popup">
            <Popup longitude={90.3938} latitude={23.8216} anchor="bottom">
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
```

- [ ] **Step 2: Write the Next-family showcase (TypeScript, "use client")**

`framework-tests/showcase/next-showcase.tsx` — identical body to the Vite file with exactly these differences:

```tsx
"use client";

// react-bkoi-gl v3 full-API showcase — Next.js App Router (TSX).
import { useEffect, useRef, useState } from 'react'
import type { MapRef } from 'react-bkoi-gl'
import { /* same named imports as the Vite file */ } from 'react-bkoi-gl'
import 'react-bkoi-gl/styles'

const API_KEY = process.env.NEXT_PUBLIC_BARIKOI_API_KEY
// ...everything else identical to vite-App.jsx, with:
//  - window accesses wrapped as (window as any).__SHOWCASE etc.
//  - const mapRef = useRef<MapRef | null>(null)
//  - default export named `function Showcase()` instead of App
```

Full file (no placeholders — this is the real content):

```tsx
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

const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Point A' }, geometry: { type: 'Point', coordinates: [90.3938, 23.8216] } },
    { type: 'Feature', properties: { name: 'Point B' }, geometry: { type: 'Point', coordinates: [90.4, 23.83] } },
  ],
}

const w = window as any
const S = (w.__SHOWCASE = {
  version6: false, logger: false, gpuError: false, customControl: false,
  marker: false, popup: false, sourceLayer: false, canvasSource: false,
  useMap: false, mapRef: false, terrain: false, globe: false, draw: false,
  minimap: false, drawCreate: 0, drawUpdate: 0, drawDelete: 0,
  warnings: [], errors: [],
})
const flag = (k: string, v: any = true) => { S[k] = v }

try {
  setLogger({
    debug: () => {}, info: () => {},
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
            <MinimapControl position="bottom-right" zoomAdjust={-5} containerStyle={{ width: 180, height: 130 }} />
          </MountFlag>
          <MountFlag name="marker">
            <Marker longitude={90.3938} latitude={23.8216} color="red" />
            <Marker longitude={90.4} latitude={23.83}>
              <div style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>custom</div>
            </Marker>
          </MountFlag>
          <MountFlag name="popup">
            <Popup longitude={90.3938} latitude={23.8216} anchor="bottom">
              <div>Dhaka — react-bkoi-gl showcase</div>
            </Popup>
          </MountFlag>
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
```

- [ ] **Step 3: Write the CRA-family showcase**

`framework-tests/showcase/cra-App.js` — same as `vite-App.jsx` with exactly two differences: no `import.meta.env` line (uses `const API_KEY = process.env.REACT_APP_BARIKOI_API_KEY`) and it stays valid JS (identical otherwise).

- [ ] **Step 4: Sanity-check the three files exist**

Run: `ls /Users/barikoi/Desktop/BKoi-GL-Test/framework-tests/showcase/`
Expected: `cra-App.js  next-showcase.tsx  vite-App.jsx`

---

### Task 4: Wire the 4 npm Vite projects (vite5, vite6, vite7)

For EACH of `vite5-react`, `vite6-react`, `vite7-react` (repeat identical steps; only the dir differs):

- [ ] **Step 1: Write `.env`**

Write `<dir>/.env`:

```
VITE_BARIKOI_API_KEY=MjA5NTpRSllMQU5VS0k2
```

- [ ] **Step 2: Replace the app entry with the showcase**

```bash
cp framework-tests/showcase/vite-App.jsx <dir>/src/App.jsx
```
(Overwrites the Vite default App. `src/main.jsx` stays as the scaffold created it — it renders `<App />` inside StrictMode.)

- [ ] **Step 3: Install base deps + tarball**

```bash
cd <dir> && npm install && npm install ../framework-tests/tarballs/react-bkoi-gl-3.0.0.tgz
```
Expected: package.json gains `"react-bkoi-gl": "file:../framework-tests/tarballs/react-bkoi-gl-3.0.0.tgz"`.

- [ ] **Step 4: Build (production bundling proof)**

```bash
cd <dir> && npm run build
```
Expected: `vite build` succeeds, `dist/` produced. Any failure here is a genuine matrix finding — record the full stderr.

---

### Task 5: Wire `vite-yarn` (Vite 8 + yarn classic)

- [ ] **Step 1: `.env`** — same as Task 4 Step 1, in `vite-yarn/`.

- [ ] **Step 2: Copy showcase**

```bash
cp framework-tests/showcase/vite-App.jsx vite-yarn/src/App.jsx
```

- [ ] **Step 3: Install with yarn classic**

```bash
cd vite-yarn && npx -y yarn@1.22.22 install && npx -y yarn@1.22.22 add file:../framework-tests/tarballs/react-bkoi-gl-3.0.0.tgz
```
Expected: `yarn add v1.22.22 ... Done`. (If berry PnP interferes, add `vite-yarn/.yarnrc.yml` with `nodeLinker: node-modules` and retry.)

- [ ] **Step 4: Build**

```bash
cd vite-yarn && npx -y yarn@1.22.22 build
```
Expected: succeeds.

---

### Task 6: Wire the 4 Next projects (explicit bundler-mode scripts)

For EACH project, Steps 1–3 are identical except `dir` and the script JSON:

- [ ] **Step 1: Write `.env`** in the project root:

```
NEXT_PUBLIC_BARIKOI_API_KEY=MjA5NTpRSllMQU5VS0k2
```

- [ ] **Step 2: Add the showcase + replace page.tsx**

```bash
cp framework-tests/showcase/next-showcase.tsx <project>/<appdir>/showcase.tsx
```
Then REPLACE the full contents of `<project>/<appdir>/page.tsx` with:

```tsx
import Showcase from './showcase'

export default function Page() {
  return <Showcase />
}
```

(`appdir` per project: `next15-webpack` → `app`, `next15-turbopack` → `src/app`, `next16-webpack` → `src/app`, `next16-turbopack` → `app`.)

- [ ] **Step 3: Make the bundler mode explicit in package.json scripts**

- `next15-webpack` → scripts:
```json
"dev": "next dev",
"dev:webpack": "next dev",
"build": "next build",
"build:webpack": "next build",
"start": "next start",
"lint": "eslint"
```
- `next15-turbopack` → scripts:
```json
"dev": "next dev --turbopack",
"dev:turbopack": "next dev --turbopack",
"build": "next build --turbopack",
"build:turbopack": "next build --turbopack",
"start": "next start",
"lint": "eslint"
```
- `next16-webpack` → scripts:
```json
"dev": "next dev --webpack",
"dev:webpack": "next dev --webpack",
"build": "next build --webpack",
"build:webpack": "next build --webpack",
"start": "next start",
"lint": "eslint"
```
- `next16-turbopack` → scripts:
```json
"dev": "next dev",
"dev:turbopack": "next dev --turbopack",
"build": "next build",
"build:turbopack": "next build --turbopack",
"start": "next start",
"lint": "eslint"
```
(Next 15 default = webpack; Next 16 default = turbopack; `--webpack` on Next 16 dev may be unsupported → the runner records `skipped` for that cell if so.)

- [ ] **Step 4: Install base deps + tarball (each project)**

```bash
cd <project> && npm install && npm install ../framework-tests/tarballs/react-bkoi-gl-3.0.0.tgz
```

- [ ] **Step 5: Build each project (prod bundling proof per mode)**

```bash
cd <project> && npm run build
```
Expected: all four succeed (next16-webpack proves `--webpack` exists on 16.3.4; if `next build --webpack` errors with "unknown option", that's a finding — record it and the runner will mark the cell `skipped` on rerun).

---

### Task 7: Wire `cra-react` (react-scripts 5 + Jest cell)

- [ ] **Step 1: `.env`**

Write `cra-react/.env`:

```
REACT_APP_BARIKOI_API_KEY=MjA5NTpRSllMQU5VS0k2
```

- [ ] **Step 2: Replace App.js with the showcase**

```bash
cp framework-tests/showcase/cra-App.js cra-react/src/App.js
```

- [ ] **Step 3: Replace App.test.js with the Jest resolution proof (mocked engine — CRA Jest cannot parse maplibre v6 ES2022)**

Write `cra-react/src/App.test.js`:

```js
/**
 * CRA + Jest resolution proof. react-scripts 5's frozen babel cannot parse
 * maplibre-gl v6 ES2022 syntax, and Jest cannot resolve the engine's
 * exports-only package — the documented pattern is to virtual-mock the
 * engine in unit tests and rely on the production build + browser for real
 * rendering (covered by framework-tests).
 */
jest.mock(
  'maplibre-gl',
  () => ({
    Map: function Map() {},
    setWorkerUrl: jest.fn(),
    getWorkerUrl: jest.fn(() => ''),
    getVersion: jest.fn(() => '0.0.0'),
    GPUInitializationError: class GPUInitializationError extends Error {},
  }),
  { virtual: true }
)

import * as lib from 'react-bkoi-gl'

test('react-bkoi-gl resolves under Jest and exposes the documented exports', () => {
  for (const name of ['Map', 'Marker', 'Popup', 'Source', 'Layer', 'NavigationControl']) {
    expect(lib[name]).toBeTruthy()
  }
  expect(typeof lib.setWorkerUrl).toBe('function')
  expect(typeof lib.setLogger).toBe('function')
  expect(typeof lib.useMap).toBe('function')
  expect(typeof lib.useControl).toBe('function')
  expect(typeof lib.DrawControl).toBe('function')
  expect(typeof lib.MinimapControl).toBe('function')
  expect(typeof lib.GlobeControl).toBe('function')
})
```

(Leave `src/index.js`, `src/setupTests.js`, `src/index.css` as scaffolded. `src/App.css` becomes unreferenced — harmless.)

- [ ] **Step 4: Install base deps + tarball**

```bash
cd cra-react && npm install && npm install ../framework-tests/tarballs/react-bkoi-gl-3.0.0.tgz
```

- [ ] **Step 5: Build + Jest (each is a matrix cell later; prove them now)**

```bash
cd cra-react && DISABLE_ESLINT_PLUGIN=true CI=true npm run build && CI=true npx react-scripts test --watchAll=false
```
Expected: build succeeds (`build/` produced); Jest: 1 passed. Note: CRA's dev/build are strict-CSP-free; ESLint plugin disabled because the parent folder's eslint config can conflict (same accommodation the library's own harness makes).

---

### Task 8: Runner — full matrix orchestration + run + debug

**Files:**
- Create: `framework-tests/runner.mjs`

- [ ] **Step 1: Write runner.mjs**

`framework-tests/runner.mjs`:

```js
#!/usr/bin/env node
/**
 * Full matrix runner: per project → (install?) → cells (dev / build+serve / jest)
 * → headless verify. Writes results/*.json + RESULTS.md.
 *
 * Usage: node runner.mjs [--only=key1,key2] [--skip-install] [--skip-build-lib]
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { shAsync, startServer, serveStatic, waitUp, here, ROOT } from './lib.mjs'

/** Run a build cell, capturing stderr. Returns { ok, stderr } and classifies
 *  unsupported bundler flags (e.g. `next build --webpack` on a version lacking
 *  it) as status 'skipped' — mirroring the library harness's convention. */
function runBuildCell(cmd, cwd, env = {}) {
  try {
    execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000, env: { ...process.env, ...env } })
    return { status: 'pass', stderr: '' }
  } catch (e) {
    const errText = String(e)
    if (/unknown option|unknown flag|invalid option|unrecognized option/i.test(errText)) {
      return { status: 'skipped', stderr: errText.slice(0, 300) }
    }
    return { status: 'fail', stderr: errText.slice(0, 500) }
  }
}

const arg = (k, d) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`))
  return p ? p.slice(k.length + 3) : d
}
const only = arg('only', 'vite5,vite6,vite7,viteYarn,next15-webpack,next15-turbopack,next16-webpack,next16-turbopack,cra').split(',')
const SKIP_INSTALL = process.argv.includes('--skip-install')
const SKIP_BUILD_LIB = process.argv.includes('--skip-build-lib')
const TARBALL = path.join(here, 'tarballs', 'react-bkoi-gl-3.0.0.tgz')
const RESULTS = path.join(here, 'results')
fs.mkdirSync(RESULTS, { recursive: true })

const PORTS = { base: 6300 }
const port = (i) => PORTS.base + i * 3

const PROJECTS = [
  { key: 'vite5', dir: 'vite5-react', pm: 'npm', kind: 'vite' },
  { key: 'vite6', dir: 'vite6-react', pm: 'npm', kind: 'vite' },
  { key: 'vite7', dir: 'vite7-react', pm: 'npm', kind: 'vite' },
  { key: 'viteYarn', dir: 'vite-yarn', pm: 'yarn1', kind: 'vite' },
  { key: 'next15-webpack', dir: 'next15-webpack', pm: 'npm', kind: 'next' },
  { key: 'next15-turbopack', dir: 'next15-turbopack', pm: 'npm', kind: 'next' },
  { key: 'next16-webpack', dir: 'next16-webpack', pm: 'npm', kind: 'next' },
  { key: 'next16-turbopack', dir: 'next16-turbopack', pm: 'npm', kind: 'next' },
  { key: 'cra', dir: 'cra-react', pm: 'npm', kind: 'cra' },
]

const INSTALL = {
  npm: (cwd) => [`npm install`, `npm install ${TARBALL}`],
  yarn1: (cwd) => [`npx -y yarn@1.22.22 install`, `npx -y yarn@1.22.22 add file:${TARBALL}`],
}

function cellPlan(p, i) {
  const P = port(i)
  if (p.kind === 'vite') return [
    { name: 'dev', cmd: `npm run dev -- --port ${P} --strictPort`, serve: { type: 'server', url: `http://localhost:${P}/` }, dev: true },
    { name: 'build+preview', cmd: `npm run build`, serve: { type: 'static', dir: path.join(ROOT, p.dir, 'dist') } },
  ]
  if (p.kind === 'next') return [
    { name: 'dev', cmd: `npm run dev -- -p ${P}`, serve: { type: 'server', url: `http://localhost:${P}/` }, dev: true },
    { name: 'build+start', cmd: `npm run build`, serve: { type: 'server', cmd: `npx next start -p ${P + 1}`, url: `http://localhost:${P + 1}/` } },
  ]
  return [
    { name: 'dev', cmd: `BROWSER=none PORT=${P} npm run dev`, serve: { type: 'server', url: `http://localhost:${P}/` }, dev: true, waitUpMs: 240_000 },
    { name: 'build+serve', cmd: `DISABLE_ESLINT_PLUGIN=true CI=true npm run build`, serve: { type: 'static', dir: path.join(ROOT, p.dir, 'build') } },
    { name: 'jest', cmd: `CI=true npx react-scripts test --watchAll=false`, jest: true },
  ]
}

async function runVerify(label, url, dev, outFile, staticDir) {
  const args = ['verify.mjs', '--name', label, '--out', outFile]
  if (url) args.push('--url', url)
  if (staticDir) args.push('--dir', staticDir)
  if (dev) args.push('--dev')
  return shAsync(`node ${args.map((a) => `"${a}"`).join(' ')}`, here, 420_000)
}

// ---------- optional: build lib + tarball fresh ----------
if (!SKIP_BUILD_LIB && !SKIP_INSTALL) {
  console.log('[runner] building library...')
  await shAsync('npm run build', path.join(ROOT, 'react-bkoi-gl'), 300_000)
  await shAsync(`npm pack --pack-destination ${path.join(here, 'tarballs')}`, path.join(ROOT, 'react-bkoi-gl'), 120_000)
}
if (!fs.existsSync(TARBALL)) { console.error(`[runner] missing tarball ${TARBALL}`); process.exit(2) }

const rows = []
let idx = 0
for (const p of PROJECTS) {
  if (!only.includes(p.key)) { idx++; continue }
  const cwd = path.join(ROOT, p.dir)
  console.log(`\n===== ${p.key} (${p.dir}) =====`)

  if (!SKIP_INSTALL) {
    for (const cmd of INSTALL[p.pm](cwd)) {
      const ok = await shAsync(cmd, cwd, 600_000)
      if (!ok) { rows.push({ project: p.key, cell: 'install', status: 'fail', note: cmd }); break }
    }
  }

  for (const cell of cellPlan(p, idx)) {
    const res = { project: p.key, cell: cell.name, status: 'fail', note: '', verify: null }
    if (cell.jest) {
      res.status = (await shAsync(cell.cmd, cwd, 300_000)) ? 'pass' : 'fail'
      rows.push(res); continue
    }
    let stop = null
    try {
      let build
      if (cell.serve.type === 'static' || cell.serve.cmd) {
        // build cells: run the build synchronously with capture for skip/fail classification
        build = runBuildCell(cell.cmd, cwd, cell.env || {})
        if (build.status === 'skipped') { res.status = 'skipped'; res.note = build.stderr; rows.push(res); continue }
        if (build.status === 'fail') { res.note = `build failed: ${build.stderr.slice(0, 150)}`; rows.push(res); continue }
      }
      if (cell.serve.type === 'static') {
        const server = await serveStatic(cell.serve.dir, port(idx) + 2)
        stop = async () => new Promise((r) => server.close(r))
        var url = `http://localhost:${port(idx) + 2}/`
      } else {
        if (cell.serve.cmd) {
          const s = startServer(cell.serve.cmd, cwd, extractPort(cell.serve.cmd))
          stop = s.stop
          var url = s.url
        } else {
          // dev cell: cmd IS the dev server
          const s = startServer(cell.cmd, cwd, extractPort(cell.cmd))
          stop = s.stop
          var url = s.url
        }
        const up = await waitUp(url, cell.waitUpMs || 120_000)
        if (!up) { res.note = 'server did not come up'; rows.push(res); await stop(); continue }
      }
      const out = path.join(RESULTS, `${p.key}-${cell.name.replace(/[^a-z0-9]+/gi, '-')}.json`)
      res.status = (await runVerify(`${p.key}/${cell.name}`, url, !!cell.dev, out)) ? 'pass' : 'fail'
      res.verify = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null
      if (res.status === 'fail' && res.verify) {
        res.note = `missing=[${res.verify.missing}] errors=${res.verify.errors.length} workers=${JSON.stringify(res.verify.workerStatus)} draw=${res.verify.drawInteractive}`
      }
    } catch (e) {
      res.note = String(e?.message ?? e).slice(0, 200)
    } finally {
      if (stop) await stop()
    }
    rows.push(res)
  }
  idx++
}

// ---------- RESULTS.md ----------
const line = (r) => {
  const icon = r.status === 'pass' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌'
  const draw = r.verify?.drawInteractive
  return `| ${r.project} | ${r.cell} | ${icon} ${r.status} | ${r.note || (draw != null ? `draw=${draw}` : '')} |`
}
const md = [
  '# react-bkoi-gl v3 — framework matrix results',
  `Generated: ${new Date().toISOString()}`, '',
  '| Project | Cell | Status | Notes |', '|---|---|---|---|',
  ...rows.map(line),
].join('\n')
fs.writeFileSync(path.join(here, 'RESULTS.md'), md)
console.log('\n===== SUMMARY =====')
for (const r of rows) console.log(`${r.status.toUpperCase().padEnd(4)} ${r.project}/${r.cell} ${r.note}`)
const allOk = rows.every((r) => r.status === 'pass' || r.status === 'skipped')
console.log(`\n[runner] RESULTS.md written — overall: ${allOk ? 'PASS' : 'FAIL'}`)
process.exit(allOk ? 0 : 1)

function extractPort(cmd) {
  const m = cmd.match(/-p (\d{4,5})|--port (\d{4,5})|(\d{4,5})/)
  return Number(m?.[1] ?? m?.[2] ?? m?.[3] ?? 6399)
}
```

- [ ] **Step 2: Smoke-run one project first**

Run:
```bash
cd /Users/barikoi/Desktop/BKoi-GL-Test/framework-tests && node runner.mjs --only=vite5 --skip-install --skip-build-lib
```
Expected: `vite5 dev` and `vite5 build+preview` both PASS. Debug any verify failure NOW (read the JSON in `results/`, fix showcase or verify), then rerun.

- [ ] **Step 3: Run the FULL matrix**

Run (background — installs are long):
```bash
cd /Users/barikoi/Desktop/BKoi-GL-Test/framework-tests && node runner.mjs 2>&1 | tee run-full.log
```
Poll `run-full.log` until `===== SUMMARY =====`. Expected runtime: 20–60 min (9 installs + 17 cells).

- [ ] **Step 4: Debug-on-failure loop (spec requirement — no mark-and-move-on)**

For every FAIL row: read `results/<project>-<cell>.json` (missing flags, workerStatus, errors arrays, drawInteractive), reproduce with a single-cell run, fix root cause (showcase bug vs library bug vs harness bug):
- showcase/harness bug → fix, rerun that project only.
- library bug → capture minimal repro + console output; do NOT paper over it. Record it as a finding in RESULTS.md notes and continue the matrix; all library bugs get reported in the final summary.

Rerun failures cheaply: `node runner.mjs --only=<key> --skip-install --skip-build-lib`.

---

### Task 9: Final report

- [ ] **Step 1: Review RESULTS.md end-to-end** — expected rows: 9× dev, 9× build, 1× CRA jest (19 verify cells + jest + any `skipped` flags). Every row is ✅/⏭️/❌ with notes; any ❌ has a root-cause note.

- [ ] **Step 2: Write the summary for the user** — matrix table, list of library bugs found (if any) with minimal repro pointers, recommendation on whether v3.0.0 is safe to publish for Vite 5/6/7, Next 15/16 (webpack+turbopack), CRA.

- [ ] **Step 3: Clean up long-lived state** — ensure no dev servers remain: `lsof -ti tcp:6300-6399 | xargs kill -9` (ignore empty). Leave `framework-tests/` in place for reruns.
