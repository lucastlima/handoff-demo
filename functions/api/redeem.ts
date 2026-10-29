import { z } from 'zod';
import type { Env } from '../../lib/env';
import { claim } from '../../lib/handoff';
import { database, failure, json, limit, parseJson, sameOrigin } from '../../lib/server';

const redeemBodySchema = z.object({
  q: z.string({ error: 'Missing link token.' }),
});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    sameOrigin(request);
    await limit(request, env, 'redeem', 60);
    const { q } = await parseJson(request, redeemBodySchema);
    return json(await claim(database(env), q));
  } catch (error) {
    return failure(error);
  }
};
