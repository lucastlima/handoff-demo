import type { Env } from '../../../../lib/env';
import { cancel, status } from '../../../../lib/handoff';
import { database, failure, json, limit, ownerSecret, sameOrigin } from '../../../../lib/server';
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try { const owner = ownerSecret(request); await limit(request, env, 'manage', 180); return json(await status(database(env), String(params.id), owner)); }
  catch (error) { return failure(error); }
};
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try { sameOrigin(request); const owner = ownerSecret(request); await limit(request, env, 'manage', 180); await cancel(database(env), String(params.id), owner); return json({ cancelled: true }); }
  catch (error) { return failure(error); }
};
