import type { Env } from '../../lib/env';
import { claim, HandoffError } from '../../lib/handoff';
import { body, database, failure, json, limit, sameOrigin } from '../../lib/server';
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    sameOrigin(request); await limit(request, env, 'redeem', 60); const data = await body(request);
    if (typeof data.q !== 'string') throw new HandoffError('Missing link token.');
    return json(await claim(database(env), data.q));
  } catch (error) { return failure(error); }
};
