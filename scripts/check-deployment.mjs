import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'));
const database = config.d1_databases?.find(binding => binding.binding === 'DB');
if (!database?.database_id || database.database_id === '00000000-0000-4000-8000-000000000000') {
  console.error('Configure your real D1 database_id in wrangler.json before deploying. See README.md → Deploy to Cloudflare Pages.');
  process.exit(1);
}
