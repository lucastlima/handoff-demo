# QR Handoff Demo

A desktop-to-mobile session handoff prototype built with **React + Vite**, **Cloudflare Pages Functions**, **D1 (SQLite)**, and **Zod**.

## Project Layout

```text
src/                 React UI (desktop composer + /handoff mobile claim view)
functions/           Cloudflare Pages HTTP handlers (/api/* and /handoff)
lib/                 Zod schemas, D1 session/token queries, and HTTP helpers
migrations/          D1 SQLite schema migration
public/              Static headers and Function invocation rules
tests/               SQLite unit tests, routing checks, and live HTTP tests
wrangler.json        Cloudflare Pages and D1 configuration
```

## Local Development

Requires Node 24+.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open `http://localhost:8788` to run against Cloudflare's local Pages + D1 emulator (no Cloudflare account login required).

For Vite HMR during UI work, leave `npm run dev` running on port `8788` and run `npm run dev:ui` (`http://localhost:5173`) in a second terminal.

## Deploy to Cloudflare Pages

One-time setup:

```sh
npx wrangler login
npx wrangler d1 create handoff-pages
```

Put the returned `database_id` into `wrangler.json`, create the Pages project once, and deploy:

```sh
npx wrangler pages project create handoff-pages --production-branch main
npm run deploy
```

`public/_routes.json` invokes Functions only for `/api`, `/api/*`, `/handoff`, and `/handoff/*` so static asset requests remain unmetered.

## How Handoff Works

- **Opaque 192-bit tokens:** The QR code carries only `/handoff?q=<token>`, keeping QR density constant up to the 2,048-byte payload limit.
- **Hashed at rest:** Raw tokens and desktop session-owner secrets are never stored—only SHA-256 digests are persisted in D1.
- **Sliding-window rotation:** Tokens expire after 15 seconds and rotate every 5 seconds, keeping up to 3 overlapping tokens valid so mid-rotation scans still succeed.
- **Atomic single-use claim:** Redeeming a token atomically marks the session consumed, invalidates all sibling tokens, and wipes the stored `payload` in a single D1 batch.
- **Redirects vs. payloads:**
  - **With a `redirect` field:** `GET /handoff?q=…` claims the token and returns an immediate `302` redirect to an allowlisted HTTPS host (`ALLOWED_REDIRECT_HOSTS` in `wrangler.json`), triggering iOS Universal Links / Android App Links when installed. `HEAD` and `Sec-Purpose: prefetch` requests return `204` without consuming the token.
  - **Without a `redirect` field:** `GET /handoff?q=…` serves the SPA non-destructively (so chat link-preview bots don't burn the token) and redeems once via `POST /api/redeem`.

## Verification

```sh
npm run lint
npm test
npm run build
npm run preview    # keep running in another terminal
npm run test:http
```
