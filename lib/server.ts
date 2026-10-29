import type { z } from 'zod';
import type { Env } from './env';
import { DEFAULT_HOSTS, HandoffError, rateLimit, tokenSchema } from './handoff';

export const secureHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function database(env: Env) {
  return env.DB;
}

export function allowedHosts(env: Env) {
  return (env.ALLOWED_REDIRECT_HOSTS || DEFAULT_HOSTS.join(','))
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: secureHeaders });
}

export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof HandoffError ? error.message : 'Something went wrong. Please try again.',
    },
    error instanceof HandoffError ? error.status : 500
  );
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  ) {
    throw new HandoffError('This request is not allowed.', 403);
  }
}

export function ownerSecret(request: Request) {
  const value = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const parsed = tokenSchema.safeParse(value);
  if (!parsed.success) throw new HandoffError('Session authorization is required.', 401);
  return parsed.data;
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw new HandoffError('Send JSON.', 415);
  }
  const raw = await request.text();
  if (!raw) throw new HandoffError('A request body is required.');
  if (new TextEncoder().encode(raw).length > 8192) {
    throw new HandoffError('This request is too large.', 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HandoffError('The request contains invalid JSON.');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HandoffError(parsed.error.issues[0]?.message || 'Invalid request body.');
  }
  return parsed.data;
}

export async function limit(request: Request, env: Env, scope: string, max: number) {
  await rateLimit(database(env), request.headers.get('CF-Connecting-IP') || 'local', scope, max);
}
