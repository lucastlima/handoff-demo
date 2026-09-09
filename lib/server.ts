import type { Env } from './env';
import { DEFAULT_HOSTS, HandoffError, rateLimit } from './handoff';
export const secureHeaders = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow' };
export function database(env: Env) { return env.DB; }
export function allowedHosts(env: Env) { return (env.ALLOWED_REDIRECT_HOSTS || DEFAULT_HOSTS.join(',')).split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean); }
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: secureHeaders }); }
export function failure(error: unknown) { return json({ error: error instanceof HandoffError ? error.message : 'Something went wrong. Please try again.' }, error instanceof HandoffError ? error.status : 500); }
export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HandoffError('This request is not allowed.', 403);
}
export function ownerSecret(request: Request) {
  const value = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (!/^[A-Za-z0-9_-]{32}$/.test(value)) throw new HandoffError('Session authorization is required.', 401);
  return value;
}
export async function body(request: Request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HandoffError('Send JSON.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new HandoffError('A request body is required.');
  let bytes = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 8192) { await reader.cancel(); throw new HandoffError('This request is too large.', 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(buffer)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new HandoffError('The request contains invalid JSON.'); }
}
export async function limit(request: Request, env: Env, scope: string, max: number) { await rateLimit(database(env), request.headers.get('CF-Connecting-IP') || 'local', scope, max); }
