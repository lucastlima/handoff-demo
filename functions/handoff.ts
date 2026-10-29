import type { Env } from '../lib/env';
import { claim, HandoffError, peek } from '../lib/handoff';
import { database, limit, secureHeaders } from '../lib/server';

const appCsp =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'";

async function serveApp(
  request: Request,
  assets: { fetch: (input: URL) => Promise<Response> },
  status = 200
) {
  const asset = await assets.fetch(new URL('/', request.url));
  return new Response(asset.body, {
    status,
    headers: {
      ...secureHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': appCsp,
    },
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'HEAD') return new Response(null, { status: 204, headers: secureHeaders });
  if (request.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...secureHeaders, Allow: 'GET, HEAD' },
    });
  }
  if (
    /prefetch|prerender/i.test(
      `${request.headers.get('Purpose')} ${request.headers.get('Sec-Purpose')}`
    )
  ) {
    return new Response(null, { status: 204, headers: secureHeaders });
  }

  try {
    await limit(request, env, 'redeem', 60);
    const q = new URL(request.url).searchParams.get('q') || '';
    const info = await peek(database(env), q);
    if (info.redirect) {
      const result = await claim(database(env), q);
      return new Response(null, {
        status: 302,
        headers: { ...secureHeaders, Location: result.redirect! },
      });
    }
    return serveApp(request, env.ASSETS);
  } catch (error) {
    const status = error instanceof HandoffError ? error.status : 503;
    return serveApp(request, env.ASSETS, status);
  }
};
