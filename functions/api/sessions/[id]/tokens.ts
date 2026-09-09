import type { Env } from '../../../../lib/env';
import { issueToken } from '../../../../lib/handoff';
import { database, failure, json, limit, ownerSecret, sameOrigin } from '../../../../lib/server';
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    sameOrigin(request);
    const owner = ownerSecret(request);
    await limit(request, env, 'manage', 180);
    return json(await issueToken(database(env), String(params.id), owner));
  } catch (error) {
    return failure(error);
  }
};
