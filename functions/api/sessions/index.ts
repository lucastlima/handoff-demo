import type { Env } from '../../../lib/env';
import { cleanup, createSession } from '../../../lib/handoff';
import {
  allowedHosts,
  body,
  database,
  failure,
  json,
  limit,
  sameOrigin,
} from '../../../lib/server';
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    sameOrigin(request);
    await cleanup(database(env));
    await limit(request, env, 'create', 10);
    const data = await body(request);
    return json(
      await createSession(database(env), data.payload, data.mode ?? 'server', allowedHosts(env)),
      201
    );
  } catch (error) {
    return failure(error);
  }
};
