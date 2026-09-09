import { json } from '../../lib/server';
// Keep unknown API paths and unsupported methods from falling back to the SPA's HTML.
export const onRequest: PagesFunction = () => json({ error: 'API route or method not found.' }, 404);
