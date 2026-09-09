import assert from 'node:assert/strict';
const base = process.env.TEST_ORIGIN || 'http://localhost:8788';
const active = [];
const call = (path, init = {}) => fetch(base + path, { ...init, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...init.headers } });
async function make(payload, mode = 'server') {
  const response = await call('/api/sessions', { method: 'POST', body: JSON.stringify({ payload, mode }) });
  assert.equal(response.status, 201, await response.clone().text());
  const data = await response.json(); active.push(data); return data;
}
async function redeem(q) { return call('/api/redeem', { method: 'POST', body: JSON.stringify({ q }) }); }
const auth = session => ({ Authorization: `Bearer ${session.owner}` });
try {
  const home = await call('/'); assert.equal(home.status, 200);
  const homeHtml = await home.text(); assert.match(homeHtml, /<div id="app"><\/div>/);
  assert.equal(homeHtml.includes('_next/'), false);
  const script = homeHtml.match(/src="([^"]+\/assets\/[^"]+\.js|\/assets\/[^"]+\.js)"/);
  assert.ok(script, 'Vite must emit a static JavaScript asset');
  const asset = await call(script[1]); assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  const unknownApi = await call('/api/not-a-real-route'); assert.equal(unknownApi.status, 404);
  assert.match(unknownApi.headers.get('content-type'), /application\/json/);
  assert.equal((await call('/handoff', { method: 'POST' })).status, 405);
  console.log('PASS Pages serves the static SPA and cached assets; unknown API routes stay JSON');
  const config = await call('/api/config'); assert.equal(config.status, 200);
  assert.ok((await config.json()).allowedRedirectHosts.includes('maps.apple.com'));
  const first = await make({ name: 'Alex', message: '<script>alert(1)</script>' });
  const shell = await call(`/handoff?q=${first.q}`); assert.equal(shell.status, 200);
  assert.match(shell.headers.get('cache-control'), /no-store/);
  assert.equal(shell.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(shell.headers.get('content-security-policy').includes("script-src 'nonce-"));
  assert.equal((await shell.text()).includes('<script>alert(1)</script>'), false);
  const before = await call(`/api/sessions/${first.id}`, { headers: auth(first) }); assert.equal((await before.json()).status, 'waiting');
  const result = await redeem(first.q); assert.equal(result.status, 200); assert.equal((await result.json()).payload.name, 'Alex');
  assert.equal((await redeem(first.q)).status, 410);
  console.log('PASS payload GET is non-consuming; POST claims once; secure headers and safe rendering');

  const server = await make({ redirect: 'https://example.com/next?x=1&y=2' });
  assert.equal((await call(`/handoff?q=${server.q}`, { method: 'HEAD' })).status, 204);
  assert.equal((await call(`/handoff?q=${server.q}`, { headers: { 'Sec-Purpose': 'prefetch' } })).status, 204);
  const direct = await call(`/handoff?q=${server.q}`);
  assert.equal(direct.status, 302); assert.equal(direct.headers.get('location'), 'https://example.com/next?x=1&y=2'); assert.equal(await direct.text(), '');
  assert.equal((await call(`/handoff?q=${server.q}`)).status, 410);
  console.log('PASS immediate HTTP redirect; HEAD and declared prefetch do not consume; replay is blocked');

  const browser = await make({ redirect: 'https://example.com/?q=%3C/script%3E' }, 'browser');
  const instant = await call(`/handoff?q=${browser.q}`); assert.equal(instant.status, 200);
  const html = await instant.text(); const scriptAt = html.indexOf('<script nonce=');
  assert.ok(scriptAt > 0 && scriptAt < html.indexOf('<style>') && scriptAt < html.indexOf('<body>'));
  assert.match(html, /<script nonce="[^"]+">location\.replace\(/);
  assert.equal(/DOMContentLoaded|onload|setTimeout|fetch\(/.test(html), false);
  assert.match(html, /<a class="button" href=/); assert.equal((await redeem(browser.q)).status, 410);
  console.log('PASS browser redirect is the first inline script; fallback is a direct anchor');

  const race = await make({ value: 'one winner' });
  await new Promise(resolve => setTimeout(resolve, 1100));
  const tokenResponse = await call(`/api/sessions/${race.id}/tokens`, { method: 'POST', headers: auth(race) }); assert.equal(tokenResponse.status, 200);
  const token = await tokenResponse.json();
  const raceResults = await Promise.all([redeem(race.q), redeem(token.q), redeem(race.q)]);
  assert.deepEqual(raceResults.map(r => r.status).sort(), [200, 410, 410]);
  console.log('PASS concurrent requests against real local D1 have exactly one winner across rotating codes');

  const invalid = await call('/api/sessions', { method: 'POST', body: JSON.stringify({ payload: { redirect: 'javascript:alert(1)' } }) }); assert.equal(invalid.status, 400);
  const crossOrigin = await call('/api/sessions', { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: JSON.stringify({ payload: { x: 'y' } }) }); assert.equal(crossOrigin.status, 403);
  assert.equal((await call(`/api/sessions/${first.id}`)).status, 401);
  assert.equal((await call('/handoff?q=invalid')).status, 404);
  console.log('PASS unsafe redirects, cross-origin mutations, missing ownership, and malformed links rejected');
} finally {
  for (const s of active) await call(`/api/sessions/${s.id}`, { method: 'DELETE', headers: auth(s) });
}
