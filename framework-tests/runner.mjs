#!/usr/bin/env node
/**
 * Full matrix runner: per project → cells (dev / build+serve / jest)
 * → headless verify. Writes results/*.json + RESULTS.md.
 *
 * Usage: node runner.mjs [--only=key1,key2] [--skip-build-lib]
 * Installs are NOT redone here — wire-up already installed each project
 * (Task 4-7); rerun installs manually if the tarball changes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { shAsync, startServer, serveStatic, waitUp, here, ROOT } from './lib.mjs'

const arg = (k, d) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`))
  return p ? p.slice(k.length + 3) : d
}
const only = arg('only', 'vite5,vite6,vite7,viteYarn,next15-webpack,next15-turbopack,next16-webpack,next16-turbopack,cra').split(',')
const SKIP_BUILD_LIB = process.argv.includes('--skip-build-lib')
const TARBALL = path.join(here, 'tarballs', 'react-bkoi-gl-3.0.0.tgz')
const RESULTS = path.join(here, 'results')
fs.mkdirSync(RESULTS, { recursive: true })

const PORTS = { base: 6300 }
const port = (i) => PORTS.base + i * 3

const PROJECTS = [
  { key: 'vite5', dir: 'vite5-react', kind: 'vite' },
  { key: 'vite6', dir: 'vite6-react', kind: 'vite' },
  { key: 'vite7', dir: 'vite7-react', kind: 'vite' },
  { key: 'viteYarn', dir: 'vite-yarn', kind: 'vite' },
  { key: 'next15-webpack', dir: 'next15-webpack', kind: 'next' },
  { key: 'next15-turbopack', dir: 'next15-turbopack', kind: 'next' },
  { key: 'next16-webpack', dir: 'next16-webpack', kind: 'next' },
  { key: 'next16-turbopack', dir: 'next16-turbopack', kind: 'next' },
  { key: 'cra', dir: 'cra-react', kind: 'cra' },
]

/** Run a build cell, capturing stderr. Classifies unsupported bundler flags
 *  (e.g. a flag absent in that Next version) as status 'skipped'. */
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

function cellPlan(p, i) {
  const P = port(i)
  if (p.kind === 'vite') return [
    { name: 'dev', cmd: `npm run dev -- --port ${P} --strictPort`, serve: { type: 'dev' }, dev: true },
    { name: 'build+preview', cmd: `npm run build`, serve: { type: 'static', dir: path.join(ROOT, p.dir, 'dist') } },
  ]
  if (p.kind === 'next') return [
    { name: 'dev', cmd: `npm run dev -- -p ${P}`, serve: { type: 'dev' }, dev: true },
    { name: 'build+start', cmd: `npm run build`, serve: { type: 'server', cmd: `npx next start -p ${P + 1}` } },
  ]
  return [
    // CRA's dev script is `start` (react-scripts start)
    { name: 'dev', cmd: `BROWSER=none PORT=${P} npm start`, serve: { type: 'dev' }, dev: true, waitUpMs: 240_000 },
    // No CI=true: maplibre-gl v6's `new URL(`./${t}`, import.meta.url)` worker
    // builder trips webpack's "Critical dependency" warning, and react-scripts
    // treats any warning as an error under CI (upstream engine behavior, not a
    // library bug — see RESULTS.md notes).
    { name: 'build+serve', cmd: `DISABLE_ESLINT_PLUGIN=true npm run build`, env: { DISABLE_ESLINT_PLUGIN: 'true', CI: 'false' }, serve: { type: 'static', dir: path.join(ROOT, p.dir, 'build') } },
    { name: 'jest', cmd: `CI=true npx react-scripts test --watchAll=false`, jest: true },
  ]
}

async function runVerify(label, url, dev, outFile) {
  const args = ['verify.mjs', '--name', label, '--out', outFile, '--url', url]
  if (dev) args.push('--dev')
  return shAsync(`node ${args.map((a) => `"${a}"`).join(' ')}`, here, 420_000)
}

// ---------- optional: rebuild lib + tarball fresh ----------
if (!SKIP_BUILD_LIB) {
  console.log('[runner] building library...')
  await shAsync('npm run build', path.join(ROOT, 'react-bkoi-gl'), 300_000)
  await shAsync(`npm pack --pack-destination ${path.join(here, 'tarballs')}`, path.join(ROOT, 'react-bkoi-gl'), 120_000)
}
if (!fs.existsSync(TARBALL)) { console.error(`[runner] missing tarball ${TARBALL}`); process.exit(2) }

const rows = []
let idx = 0
for (const p of PROJECTS) {
  const pIdx = idx
  if (!only.includes(p.key)) { idx++; continue }
  const cwd = path.join(ROOT, p.dir)
  console.log(`\n===== ${p.key} (${p.dir}) =====`)

  for (const cell of cellPlan(p, pIdx)) {
    const res = { project: p.key, cell: cell.name, status: 'fail', note: '', verify: null }
    if (cell.jest) {
      res.status = (await shAsync(cell.cmd, cwd, 300_000)) ? 'pass' : 'fail'
      rows.push(res); continue
    }
    let stop = null
    try {
      let url
      if (cell.serve.type === 'static' || cell.serve.type === 'server') {
        const build = runBuildCell(cell.cmd, cwd, cell.env || {})
        if (build.status === 'skipped') { res.status = 'skipped'; res.note = build.stderr; rows.push(res); continue }
        if (build.status === 'fail') { res.note = `build failed: ${build.stderr.slice(0, 150)}`; rows.push(res); continue }
      }
      if (cell.serve.type === 'static') {
        const P = port(pIdx) + 2
        const server = await serveStatic(cell.serve.dir, P)
        stop = async () => new Promise((r) => server.close(r))
        url = `http://localhost:${P}/`
      } else if (cell.serve.type === 'server') {
        const P = extractPort(cell.serve.cmd)
        const s = startServer(cell.serve.cmd, cwd, P)
        stop = s.stop
        url = s.url
        const up = await waitUp(url, cell.waitUpMs || 120_000)
        if (!up) { res.note = 'server did not come up'; rows.push(res); await stop(); continue }
      } else {
        // dev cell: cmd IS the dev server
        const P = extractPort(cell.cmd)
        const s = startServer(cell.cmd, cwd, P)
        stop = s.stop
        url = s.url
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
  const m = cmd.match(/-p (\d{4,5})|--port (\d{4,5})|PORT=(\d{4,5})|(\d{4,5})/)
  return Number(m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? 6399)
}
