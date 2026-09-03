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
