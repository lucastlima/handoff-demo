import type { Env } from '../../lib/env';
import { allowedHosts, json } from '../../lib/server';
export const onRequestGet: PagesFunction<Env> = ({ env }) => json({ allowedRedirectHosts: allowedHosts(env) });
