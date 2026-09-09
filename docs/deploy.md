# Deploy Pages, Functions, and D1 via CLI

Run commands from the project root using Node 24+. Wrangler is already a development dependency.

## 1. Install and sign in

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

If you have multiple accounts, select the intended one with `CLOUDFLARE_ACCOUNT_ID` before continuing.

## 2. Create D1 once

```sh
npx wrangler d1 create handoff-pages
```

Copy the returned database ID into `wrangler.json`, replacing the all-zero placeholder. Keep the binding named `DB`:

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "handoff-pages",
  "database_id": "YOUR_RETURNED_DATABASE_ID",
  "migrations_dir": "migrations"
}]
```

This is a section of the existing configuration, not a replacement for the entire file. Keep `pages_build_output_dir`, `name`, and `vars`. Adjust `vars.ALLOWED_REDIRECT_HOSTS` if you need other app-link destinations.

## 3. Create the Pages project once

```sh
npx wrangler pages project create handoff-pages --production-branch main
```

Reuse an existing project/database if already configured. If you choose another Pages project name, update `name` in `wrangler.json` to match.

This creates a Direct Upload project. Switching to Git integration later requires a new Pages project. [Cloudflare documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/)

## 4. Deploy

```sh
npm run deploy
```

The script checks that a real database ID is configured, then runs:

```sh
npm run build
npx wrangler d1 migrations apply DB --remote
npx wrangler pages deploy dist --branch main
```

- **D1:** applies the SQL files in `migrations/` to the remote database. Local data is not copied.
- **Pages:** uploads the built frontend from `dist/`.
- **Functions:** Wrangler automatically compiles and deploys the root `functions/` directory alongside Pages. No separate Worker deployment is needed. [Functions deployment documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/#functions)

The `DB` binding and redirect-host settings come from `wrangler.json`. Run the deploy command at the project root so Wrangler finds the Functions directory.

## 5. Verify and update

Open the actual HTTPS URL printed by Wrangler. Create a payload, scan its QR code, and test both redirect modes. `/api/config` should return JSON; a successful handoff also verifies the D1 connection.

For every subsequent release:

```sh
npm run deploy
```

Only pending SQL migrations are applied. To list deployments:

```sh
npx wrangler pages deployment list --project-name handoff-pages
```

**Common issues:**

- **Not logged in / expired token:** rerun `npx wrangler login`.
- **Placeholder database ID:** replace it in `wrangler.json` with the real D1 ID.
- **No such table:** run `npm run db:migrate:remote`; `npm run db:migrate` affects only local development.
- **Redirect rejected:** add the exact HTTPS hostname to `vars.ALLOWED_REDIRECT_HOSTS` and redeploy.
