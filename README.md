# Handoff Pages

A desktop-to-mobile demo built with **React + Vite + TanStack Router**, **Cloudflare Pages Functions**, and **D1**.

This project was initialized with the official TanStack CLI. To reproduce the boilerplate in an empty directory:

```sh
npx --yes @tanstack/cli@latest create handoff-pages \
  --router-only --blank --framework React --package-manager npm \
  --git --no-intent --no-toolchain \
  --target-dir . --yes
```

The generated Vite configuration, file-based router, `.cta.json`, `tsr.config.json`, and npm lockfile are retained. Only the demo's required interface, handoff logic, and tests were migrated. There is no Next.js, Vinext, TanStack Start, SSR, Sites integration, or ORM in this project.

## Layout

```text
src/                 React interface and the official TanStack router
functions/           Cloudflare Pages HTTP handlers
lib/                 Handoff rules, D1 access, and mobile responses
migrations/          One plain SQL migration
public/              Static assets, headers, and Function invocation rules
tests/               Core, routing, and live API checks
wrangler.json        Pages and D1 configuration
```

## Run

Use Node 24 or later.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open `http://localhost:8788`. This builds the static frontend and runs Cloudflare's local Pages emulator with local D1; no Cloudflare login is needed.

For Vite hot reload, leave Pages running and start `npm run dev:ui` in another terminal. Open `http://localhost:5173`; its API and handoff requests are proxied to Pages. Use port 8788 to test the built deployment exactly.

For phone testing on the same Wi-Fi, use `npm run preview -- --ip 0.0.0.0` after building. Open the desktop interface using the computer's LAN address, so the generated QR URLs can be reached by the phone. Clipboard access needs HTTPS in most browsers; the URL can also be selected manually.

## Deploy to Cloudflare Pages

One-time setup in your Cloudflare account:

```sh
npx wrangler login
npx wrangler d1 create handoff-pages
```

Replace the local placeholder `database_id` in `wrangler.json` with the returned ID. Then create the Pages project:

```sh
npx wrangler pages project create handoff-pages --production-branch main
```

If you use a different Pages project name, update `name` in `wrangler.json`. If you belong to multiple Cloudflare accounts, set `CLOUDFLARE_ACCOUNT_ID` to the intended account first. Reuse existing resources only if they are intended for this demo.

Publish:

```sh
npm run deploy
```

This checks the database configuration, builds the app and Functions, applies remote migrations, and uploads the static output plus root Functions to Pages. Wrangler returns the actual public `pages.dev` URL. The local placeholder cannot be deployed through this script.

Alternatively, a Git-integrated Pages project uses build command `npm run build` and output directory `dist`; apply its D1 migrations before publishing schema-dependent changes. Dashboard drag-and-drop alone does not deploy the Functions backend.

### Keeping it on the free tier

`public/_routes.json` invokes Functions only for `/api`, `/api/*`, `/handoff`, and `/handoff/*`. The homepage, JavaScript, CSS, and favicon remain static Pages requests. Functions and D1 have separate free-tier quotas; desktop status polling runs every two seconds and QR rotation every five or ten seconds. Configure Function quota exhaustion to **fail closed**.

[Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

## Redirect behavior

Add a `redirect` payload field and select:

- **Server:** the Pages Function validates and claims the token, then returns an empty HTTP 302 response. No frontend page loads before the redirect.
- **Browser:** the Function validates and claims the token, then emits an inline `location.replace()` script before styles or page content. It waits for no bundle, load event, timer, or API call. The fallback is a direct anchor.
- **No redirect field:** a small mobile page uses a POST to claim and display the payload. Merely fetching its HTML does not consume it.

Edit `ALLOWED_REDIRECT_HOSTS` under `vars` in `wrangler.json` to configure exact HTTPS destinations. Defaults are `www.youtube.com`, `youtube.com`, `maps.apple.com`, and `open.spotify.com`. The supplied destination is not given additional payload parameters. Actual native app opening depends on app installation, domain associations, browser behavior, and user preferences.

## Handoff rules

- Maximum 20 text fields and 2,048 UTF-8 bytes; QR size stays fixed because it carries a random 192-bit token rather than the payload.
- Backend-enforced 15-second token expiry; each desktop session lasts at most five minutes. Rotating tokens overlap until each expires.
- One atomic D1 claim invalidates the entire session, including other rotating codes. A separate desktop management secret is required to rotate, observe, or cancel it.
- Token and management-secret digests are stored instead of their raw values. Claimed payloads are erased in the claim transaction; cancellation deletes the session.
- Expired, unclaimed data is inaccessible immediately but physically cleaned up on the next session creation. There is no scheduled retention job.
- Rate limits, bounded input, same-origin mutation checks, no-store responses, and safe text rendering protect the demo. Query-string tokens may still appear in infrastructure logs.
- Possession of a live link grants access. Rotation cannot prevent real-time forwarding. Redirect GETs intentionally consume the link; ordinary link-preview crawlers may consume them too. HEAD and declared prefetch/prerender are ignored.
- Claims are at-most-once. If delivery fails after a claim, create another handoff.

## Verify

```sh
npm test
npm run build
npm run preview  # keep running in a separate terminal
npm run test:http
```

Tests cover expiry boundaries, ownership, concurrent claims, replay, redirects, validation, and Pages routing. The HTTP checks run against actual local Pages/D1, not a mocked backend. Native app launches still need real-device verification. The optional browser WebMCP draft tool is feature-detected; no supported validation context was available for it.
