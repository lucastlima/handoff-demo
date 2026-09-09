// Platform-neutral handoff rules; the same SQL runs in D1 and the integration tests.
export const TOKEN_MS = 15_000;
export const SESSION_MS = 300_000;
export const MAX_BYTES = 2048;
export const DEFAULT_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'maps.apple.com',
  'open.spotify.com',
];
export class HandoffError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function validatePayload(input: unknown, allowedHosts = DEFAULT_HOSTS) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HandoffError('Use a JSON object with key/value pairs.');
  const entries = Object.entries(input);
  if (!entries.length || entries.length > 20)
    throw new HandoffError('Use between 1 and 20 fields.');
  for (const [key, value] of entries) {
    if (
      !key.trim() ||
      key !== key.trim() ||
      key.length > 64 ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      throw new HandoffError(
        'Keys must be unique, non-empty names of up to 64 characters, without surrounding spaces.'
      );
    if (typeof value !== 'string') throw new HandoffError('Every value must be text.');
  }
  const payload = JSON.stringify(input);
  if (new TextEncoder().encode(payload).length > MAX_BYTES)
    throw new HandoffError('Keep the payload within 2,048 bytes.', 413);
  const redirectValue = (input as Record<string, string>).redirect;
  let redirect: string | null = null;
  if (redirectValue !== undefined) {
    try {
      const url = new URL(redirectValue);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        !allowedHosts.includes(url.hostname)
      )
        throw new Error();
      redirect = url.href;
    } catch {
      throw new HandoffError(`Redirects must use HTTPS on: ${allowedHosts.join(', ')}.`);
    }
  }
  return { payload, redirect };
}
export function randomToken(size = 24) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(size))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join('');
}
export function checkToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token))
    throw new HandoffError('This link is invalid. Scan a new code.', 404);
}
export async function cleanup(db: D1Database, now = Date.now()) {
  await db.batch([
    db.prepare('DELETE FROM tokens WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(now),
  ]);
}
export async function rateLimit(
  db: D1Database,
  ip: string,
  scope: string,
  max: number,
  now = Date.now()
) {
  const key = await hash(`${scope}:${Math.floor(now / 60000)}:${ip}`);
  const result = await db
    .prepare(
      'INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = hits + 1 RETURNING hits'
    )
    .bind(key, now + 60000)
    .first<{ hits: number }>();
  if (!result || result.hits > max)
    throw new HandoffError('Too many requests. Please try again in a minute.', 429);
}
export async function createSession(
  db: D1Database,
  input: unknown,
  mode: unknown,
  allowedHosts = DEFAULT_HOSTS,
  now = Date.now()
) {
  const { payload, redirect } = validatePayload(input, allowedHosts);
  if (mode !== 'server' && mode !== 'browser')
    throw new HandoffError('Choose server or browser redirect.');
  const id = randomToken(16),
    owner = randomToken(),
    q = randomToken();
  const [ownerHash, tokenHash] = await Promise.all([hash(owner), hash(q)]);
  const expiresAt = now + SESSION_MS;
  await db.batch([
    db
      .prepare(
        'INSERT INTO sessions (id, owner_hash, payload, redirect, mode, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(id, ownerHash, payload, redirect, mode, expiresAt),
    db
      .prepare('INSERT INTO tokens (hash, session_id, issued_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, id, now, now + TOKEN_MS),
  ]);
  return {
    id,
    owner,
    sessionExpiresAt: expiresAt,
    q,
    issuedAt: now,
    expiresAt: now + TOKEN_MS,
    serverNow: now,
  };
}
export async function status(db: D1Database, id: string, owner: string, now = Date.now()) {
  const result = await db
    .prepare('SELECT expires_at, consumed_at FROM sessions WHERE id = ? AND owner_hash = ?')
    .bind(id, await hash(owner))
    .first<{ expires_at: number; consumed_at: number | null }>();
  if (!result) throw new HandoffError('This session is unavailable. Create a new handoff.', 404);
  return {
    status:
      result.consumed_at !== null ? 'complete' : result.expires_at <= now ? 'expired' : 'waiting',
    sessionExpiresAt: result.expires_at,
    serverNow: now,
  };
}
export async function issueToken(db: D1Database, id: string, owner: string, now = Date.now()) {
  const q = randomToken();
  // Prune expired tokens for this session so only active overlapping tokens remain
  await db
    .prepare('DELETE FROM tokens WHERE session_id = ? AND expires_at <= ?')
    .bind(id, now)
    .run();
  // INSERT…SELECT checks ownership and active state in the same statement as issuance.
  const result = await db
    .prepare(`INSERT INTO tokens (hash, session_id, issued_at, expires_at)
    SELECT ?, id, ?, min(?, expires_at) FROM sessions
    WHERE id = ? AND owner_hash = ? AND consumed_at IS NULL AND expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM tokens WHERE session_id = ? AND issued_at > ?)
    RETURNING issued_at, expires_at`)
    .bind(await hash(q), now, now + TOKEN_MS, id, await hash(owner), now, id, now - 1000)
    .first<{ issued_at: number; expires_at: number }>();
  if (!result) {
    const state = await status(db, id, owner, now);
    if (state.status !== 'waiting')
      throw new HandoffError('This handoff has finished. Create a new one.', 410);
    throw new HandoffError('Wait a second before generating another code.', 429);
  }
  return { q, issuedAt: result.issued_at, expiresAt: result.expires_at, serverNow: now };
}
export async function peek(db: D1Database, q: string, now = Date.now()) {
  checkToken(q);
  const row = await db
    .prepare(`SELECT s.redirect, s.mode FROM tokens t JOIN sessions s ON s.id = t.session_id
    WHERE t.hash = ? AND t.expires_at > ? AND s.expires_at > ? AND s.consumed_at IS NULL`)
    .bind(await hash(q), now, now)
    .first<{ redirect: string | null; mode: string }>();
  if (!row)
    throw new HandoffError('This link has expired or was already used. Scan a new code.', 410);
  return row;
}
export async function claim(db: D1Database, q: string, now = Date.now()) {
  checkToken(q);
  const tokenHash = await hash(q);
  // A conditional UPDATE makes the entire handoff single-use, including overlapping QR tokens.
  // Clearing sensitive fields is in the same transaction; RETURNING captures them for the winner.
  const results = await db.batch([
    db
      .prepare(`UPDATE sessions SET consumed_at = ? WHERE consumed_at IS NULL AND expires_at > ?
      AND id = (SELECT session_id FROM tokens WHERE hash = ? AND expires_at > ?)
      RETURNING payload, redirect, mode`)
      .bind(now, now, tokenHash, now),
    db
      .prepare(`UPDATE sessions SET payload = '{}', redirect = NULL WHERE consumed_at IS NOT NULL
      AND id = (SELECT session_id FROM tokens WHERE hash = ?)`)
      .bind(tokenHash),
  ]);
  const row = results[0].results[0] as
    | { payload: string; redirect: string | null; mode: string }
    | undefined;
  if (!row)
    throw new HandoffError('This link has expired or was already used. Scan a new code.', 410);
  return {
    payload: JSON.parse(row.payload) as Record<string, string>,
    redirect: row.redirect,
    mode: row.mode,
  };
}
export async function cancel(db: D1Database, id: string, owner: string) {
  await db
    .prepare('DELETE FROM sessions WHERE id = ? AND owner_hash = ?')
    .bind(id, await hash(owner))
    .run();
}
