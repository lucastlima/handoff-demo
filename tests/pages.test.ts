import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Pages invokes backend code only for handoffs and APIs, keeping static requests unmetered', () => {
  const routes = JSON.parse(
    readFileSync(new URL('../public/_routes.json', import.meta.url), 'utf8')
  );
  const matches = (pattern: string, path: string) =>
    pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
  const invokesFunction = (path: string) =>
    routes.include.some((p: string) => matches(p, path)) &&
    !routes.exclude.some((p: string) => matches(p, path));
  for (const path of [
    '/',
    '/index.html',
    '/assets/index-abc.js',
    '/assets/index-abc.css',
    '/favicon.svg',
  ])
    assert.equal(invokesFunction(path), false, path);
  for (const path of [
    '/api',
    '/api/config',
    '/api/sessions/abc/tokens',
    '/api/redeem',
    '/handoff',
    '/handoff/',
  ])
    assert.equal(invokesFunction(path), true, path);
});

test('Pages production config explicitly binds D1 and serves the Vite build', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'));
  assert.equal(config.pages_build_output_dir, './dist');
  assert.equal(config.d1_databases[0].binding, 'DB');
  assert.equal(config.d1_databases[0].migrations_dir, 'migrations');
  assert.equal('main' in config, false, 'Pages must not require a separate Worker deployment');
});
