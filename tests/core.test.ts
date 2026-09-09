import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  cancel,
  claim,
  cleanup,
  createSession,
  HandoffError,
  hash,
  issueToken,
  peek,
  rateLimit,
  status,
  validatePayload,
} from '../lib/handoff.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(readFileSync(new URL('../migrations/0001_handoff.sql', import.meta.url), 'utf8'));
  function prepare(query: string) {
    const statement = sql.prepare(query);
    let args: (string | number | null)[] = [];
    return {
      bind(...values: (string | number | null)[]) {
        args = values;
        return this;
      },
      async first() {
        return statement.all(...args)[0] ?? null;
      },
      async run() {
        return statement.run(...args);
      },
      execute() {
        return { results: statement.all(...args) };
      },
    };
  }
  const adapter = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((s) => s.execute());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: adapter as unknown as D1Database, sql };
}
const payload = { name: 'Alex', message: 'Hello from desktop' };
const isGone = (e: unknown) => e instanceof HandoffError && e.status === 410;

test('valid payload survives one claim; stored payload is erased immediately', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  assert.equal(s.q.length, 32);
  assert.deepEqual((await claim(db, s.q, 1001)).payload, payload);
  assert.equal((await status(db, s.id, s.owner, 1002)).status, 'complete');
  assert.equal(sql.prepare('SELECT payload FROM sessions').get()!.payload, '{}');
  await assert.rejects(claim(db, s.q, 1002), isGone);
  sql.close();
});
test('token is valid just before 15 seconds and invalid exactly at expiry', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  await peek(db, s.q, 15999);
  await assert.rejects(claim(db, s.q, 16000), isGone);
  assert.equal((await status(db, s.id, s.owner, 16000)).status, 'waiting');
  sql.close();
});
test('rotation overlap remains valid and one claim closes every token', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  const next = await issueToken(db, s.id, s.owner, 11000);
  await peek(db, s.q, 12000);
  await peek(db, next.q, 12000);
  await claim(db, s.q, 12000);
  await assert.rejects(claim(db, next.q, 12000), isGone);
  sql.close();
});
test('concurrent claims across different QR tokens have exactly one winner', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  const next = await issueToken(db, s.id, s.owner, 11000);
  const results = await Promise.allSettled([
    claim(db, s.q, 12000),
    claim(db, next.q, 12000),
    claim(db, next.q, 12000),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  sql.close();
});
test('token issuance is owner-only and throttled', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  await assert.rejects(issueToken(db, s.id, 'wrong-owner', 3000));
  await assert.rejects(
    issueToken(db, s.id, s.owner, 1500),
    (e: unknown) => e instanceof HandoffError && e.status === 429
  );
  await issueToken(db, s.id, s.owner, 3000);
  sql.close();
});
test('session expiry caps the last token and forbids new issuance', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  const last = await issueToken(db, s.id, s.owner, 300000);
  assert.equal(last.expiresAt, 301000);
  await assert.rejects(claim(db, last.q, 301000), isGone);
  await assert.rejects(issueToken(db, s.id, s.owner, 301000), isGone);
  sql.close();
});
test('cancel removes sessions and their tokens without permitting an unrelated owner', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  await cancel(db, s.id, 'wrong');
  await peek(db, s.q, 1001);
  await cancel(db, s.id, s.owner);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM tokens').get()!.n, 0);
  await assert.rejects(claim(db, s.q, 1002), isGone);
  sql.close();
});
test('cleanup deletes expired sessions, orphan-free tokens, and old rate buckets', async () => {
  const { db, sql } = fixture();
  await createSession(db, payload, 'server', undefined, 1000);
  await rateLimit(db, '127.0.0.1', 'create', 2, 1000);
  await cleanup(db, 301000);
  for (const table of ['sessions', 'tokens', 'rate_limits'])
    assert.equal(sql.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0);
  sql.close();
});
test('request limits are persistent and reset with the minute bucket', async () => {
  const { db, sql } = fixture();
  await rateLimit(db, 'ip', 'create', 2, 1000);
  await rateLimit(db, 'ip', 'create', 2, 1001);
  await assert.rejects(
    rateLimit(db, 'ip', 'create', 2, 1002),
    (e: unknown) => e instanceof HandoffError && e.status === 429
  );
  await rateLimit(db, 'ip', 'create', 2, 61000);
  sql.close();
});
test('redirect validation rejects schemes, credentials, deceptive hosts and ports', () => {
  for (const redirect of [
    'javascript:alert(1)',
    'http://example.com/',
    'https://example.com.evil.test/',
    'https://example.com@evil.test/',
    'https://user:pass@example.com/',
    'https://example.com:444/',
    '//example.com/',
    '',
  ])
    assert.throws(() => validatePayload({ redirect }));
  assert.equal(
    validatePayload({ redirect: 'https://maps.apple.com/?q=London' }).redirect,
    'https://maps.apple.com/?q=London'
  );
});
test('payload limits count UTF-8 bytes and reject non-text values and forbidden keys', () => {
  for (const invalid of [
    null,
    [],
    {},
    { x: 5 },
    { x: '🙂'.repeat(600) },
    { ' name ': 'a' },
    JSON.parse('{"__proto__":"x"}'),
  ])
    assert.throws(() => validatePayload(invalid));
  const nearLimit = { x: 'a'.repeat(2040) };
  assert.equal(new TextEncoder().encode(JSON.stringify(nearLimit)).length, 2048);
  validatePayload(nearLimit);
  assert.throws(() => validatePayload({ x: 'a'.repeat(2041) }));
});
test('raw capability secrets never appear in database rows', async () => {
  const { db, sql } = fixture();
  const s = await createSession(db, payload, 'server', undefined, 1000);
  assert.equal(sql.prepare('SELECT hash FROM tokens').get()!.hash, await hash(s.q));
  assert.equal(
    sql.prepare('SELECT owner_hash FROM sessions').get()!.owner_hash,
    await hash(s.owner)
  );
  sql.close();
});
