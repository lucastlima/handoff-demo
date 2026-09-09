import type { Env } from '../lib/env';
import { claim, HandoffError, peek } from '../lib/handoff';
import { database, limit, secureHeaders } from '../lib/server';
import { errorPage, payloadPage, redirectResponse } from '../lib/mobile';
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'HEAD') return new Response(null, { status: 204, headers: secureHeaders });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { ...secureHeaders, Allow: 'GET, HEAD' } });
  if (/prefetch|prerender/i.test(`${request.headers.get('Purpose')} ${request.headers.get('Sec-Purpose')}`)) return new Response(null, { status: 204, headers: secureHeaders });
  try {
    await limit(request, env, 'redeem', 60);
    const q = new URL(request.url).searchParams.get('q') || '';
    const info = await peek(database(env), q);
    if (info.redirect) {
      const result = await claim(database(env), q);
      return redirectResponse(result.redirect!, result.mode);
    }
    return payloadPage(q);
  } catch (error) {
    return errorPage(error instanceof HandoffError ? error.message : 'The service is temporarily unavailable. Please try again.', error instanceof HandoffError ? error.status : 503);
  }
};
