# QR Handoff Demo

A desktop-to-mobile session handoff prototype built on **Cloudflare Pages Functions**, **D1 (SQLite)**, and **React**.

Compose a small JSON payload (or an allowlisted redirect URL) on desktop, scan the rotating QR code with your phone camera, and watch the desktop session detect the claim and invalidate remaining tokens.

## Design Notes

- **Constant-density QR codes:** The QR encodes only an opaque 192-bit token (`/handoff?q=…`), keeping scan reliability fixed up to the 2 KB payload limit.
- **Hashed tokens & owner secrets:** Raw capability tokens and session-management secrets are never stored—only SHA-256 digests live in D1.
- **Overlapping rotation:** A new token is issued every 5s with a 15s TTL (retaining up to 3 active tokens at once) so mid-rotation camera scans don't fail.
- **Atomic single-use claim:** Redeeming sets `consumed_at` conditionally and overwrites `payload` with `{}` in one D1 batch, guaranteeing a single winner across concurrent scans.
- **Redirects vs. payloads:**
  - **Payload handoff:** `GET /handoff` serves the claim UI without consuming the token (avoiding accidental burns from chat link-preview bots) and redeems via `POST /api/redeem`.
  - **App redirect:** Setting a `redirect` field (allowlisted via `ALLOWED_REDIRECT_HOSTS` in `wrangler.json`) makes `GET /handoff` claim immediately and return `302` for iOS Universal Links / Android App Links, while ignoring `HEAD` and `prefetch` probes.

## Running Locally

Requires Node 24+. Runs locally against Wrangler's Pages + D1 simulator (no Cloudflare login needed):

```sh
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:8788`. For frontend HMR, run `npm run dev:ui` (`http://localhost:5173`) in a second terminal alongside `npm run dev`.

## Tests

```sh
npm test          # SQLite unit tests (expiry, rotation overlap, concurrent claims, validation)
npm run test:http # End-to-end HTTP checks against a running local Pages server (port 8788)
```
