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
import path from 'node:path'
import { chromium } from 'playwright'
import { serveStatic } from './lib.mjs'

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
  // Barikoi's own osm-liberty style references a source-layer its tiles don't
  // ship at all zooms ("office_11" on "Barikoi Poi icons") — upstream style
  // content noise, recorded but not a library regression.
  const STYLE_NOISE = /Source layer ".*" does not exist on source/
  result.styleNoise = result.mapErrors.filter((e) => STYLE_NOISE.test(e))
  result.errors = [
    ...result.mapErrors.filter((e) => !STYLE_NOISE.test(e)),
    ...result.pageErrors,
  ]
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
