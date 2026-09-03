# react-bkoi-gl v3.0.0 — Framework Compatibility Matrix Design

Date: 2026-09-03
Status: Approved
Owner: Barikoi (test release of react-bkoi-gl 3.0.0)

## Goal

Validate that the new `react-bkoi-gl` v3.0.0 (major release: maplibre-gl 5.24 → **6.6.0**,
React ≥18 peer, self-contained `bkoi-map-worker.mjs` auto-registered with zero bundler
config) works in the client environments it claims to support — by exercising the 9 real
test projects already scaffolded in `/Users/barikoi/Desktop/BKoi-GL-Test/` end-to-end:
install → dev → production build → headless render verification.

## Test matrix

9 projects × (dev-server verify + production build + prod-server verify). CRA adds its Jest cell.

| Project | Stack | Dev | Build | Prod verify | Notes |
|---|---|---|---|---|---|
| `vite5-react` | Vite 5 + React 18.3.1 | ✓ | `vite build` | static serve | oldest supported Vite + React floor |
| `vite6-react` | Vite 6 + React 19 | ✓ | `vite build` | static serve | |
| `vite7-react` | Vite 7 + React 19 | ✓ | `vite build` | static serve | |
| `vite-yarn` | Vite 8 + yarn 1 + React 19.2 | ✓ | `vite build` | static serve | beyond declared Vite 6/7 support — bonus signal |
| `next15-webpack` | Next 15.5.25 + React 19.1 | `next dev` | `next build` (webpack) | `next start` | explicit scripts added |
| `next15-turbopack` | Next 15.5.25 | `next dev --turbopack` | `next build --turbopack` | `next start` | explicit scripts added |
| `next16-webpack` | Next 16.3.4 + React 19.2 | `next dev --webpack` | `next build --webpack` | `next start` | explicit scripts added (N16 defaults to Turbopack) |
| `next16-turbopack` | Next 16.3.4 | `next dev` | `next build` (turbopack default) | `next start` | |
| `cra-react` | react-scripts 5 (webpack 5) + React 19 | `react-scripts start` | `react-scripts build` | static serve | + `CI=true react-scripts test --watchAll=false` with the documented maplibre mock |

Unsupported-flag outcomes (e.g. a bundler flag absent in that Next version) are recorded
as `skipped` with the reason — mirroring the package's own harness behavior.

## Package distribution

- `npm run build` in `react-bkoi-gl/` (builds dist incl. self-contained worker + styles).
- `npm pack` → tarball; each project installs the **tarball** (`npm i <tarball>` /
  `yarn add file:<tarball>`), never `npm link`. This tests the exact artifact npm users get.

## Showcase app (per project)

One comprehensive demo page per framework family, same feature checklist everywhere
(`.jsx` for vite*/cra, `.tsx` + `"use client"` for next*):

- `Map` with `onLoad` / `onError` wired to status flags (`window.__READY`, `window.__IDLE`,
  `window.__SHOWCASE`), style URL from the project-standard env prefix
  (`VITE_` / `NEXT_PUBLIC_` / `REACT_APP_` + `BARIKOI_API_KEY`).
- `import "react-bkoi-gl/styles"`.
- Controls: `NavigationControl`, `ScaleControl`, `FullscreenControl`, `GeolocateControl`,
  `AttributionControl`, `TerrainControl`, `LogoControl`.
- `Marker` + `Popup`.
- `Source` (geojson) + `Layer`; `CanvasSource`.
- `GlobeControl`; `DrawControl` (create/update/delete events counted);
  `MinimapControl`.
- `MapProvider` + `useMap`; `useControl` (custom control smoke).
- Engine surface: `getVersion()` must print `6.x`; `setLogger` capturing warnings;
  `GPUInitializationError` importable; `MapRef` typed usage (next/vite TS variants use TS
  where the project is TS; CRA stays JS).
- All flags land in `window.__SHOWCASE = { control_x: true, ... }` rendered as an on-page
  checklist.

Next.js also gets a Pages-Router-style dynamic `ssr:false`-safe structure
(App Router page → `"use client"` map view component) matching README guidance.

## Verification (headless)

New harness at `framework-tests/` (root): `runner.mjs` orchestrates; `verify.mjs`
(Playwright Chromium) asserts per cell:

1. a `Worker` was constructed (init-script shim captures URL);
2. every worker URL fetches HTTP 200;
3. `window.__READY` (wrapper onLoad fired);
4. `window.__IDLE` (engine idle — tiles parsed by worker and rendered; the silent-failure
   detector for broken worker URLs);
5. `window.__SHOWCASE` all required keys true;
6. zero uncaught page errors; zero map `onError` invocations.

Evidence: per-cell JSON in `framework-tests/results/`, final `RESULTS.md` matrix
(✅/❌/skipped + notes per project×cell).

Failures are debugged on the spot (root-cause first), not marked-and-moved-on.

## Environment

- `BARIKOI_API_KEY=MjA5NTpRSllMQU5VS0k2` written into per-project `.env` files using each
  project's standard prefix. (Plaintext on disk in 9 folders — acknowledged by user.)
- Node v20.20.2, npm 10.8.2, yarn 4.18.0-classic available; `vite-yarn` uses yarn 1 (`yarn set version classic` / `yarn_1` binary as available — fall back to `npx yarn@1`).

## Out of scope

- pnpm/bun package-manager cells, yarn PnP, React 17, CI wiring.
- The package repo's internal `tests/framework/` harness remains untouched (used only as
  the reference implementation for verification criteria).

## Success criteria

All 9 projects pass dev + build + prod-verify with full showcase checklist green and zero
page errors. CRA Jest passes with the documented mock. Any genuine library bug found gets
filed back to `react-bkoi-gl` with a minimal repro.
