import { z } from 'zod';
import type { Env } from '../../../lib/env';
import { cleanup, createSession } from '../../../lib/handoff';
import {
  allowedHosts,
  database,
  failure,
  json,
  limit,
  parseJson,
  sameOrigin,
} from '../../../lib/server';

const createSessionBodySchema = z.object({
  payload: z.unknown(),
});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    sameOrigin(request);
    await cleanup(database(env));
    await limit(request, env, 'create', 10);
    const { payload } = await parseJson(request, createSessionBodySchema);
    return json(await createSession(database(env), payload, allowedHosts(env)), 201);
  } catch (error) {
    return failure(error);
  }
};
