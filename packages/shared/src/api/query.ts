/**
 * openapi-react-query wrapper (web-03). Derives TanStack Query v5 hooks and
 * canonical `[method, path, params]` query keys straight from the OpenAPI
 * schema — no hand-rolled key factories. Invalidation is hierarchical by
 * path prefix; every mutation declares its invalidation list at its call
 * site; nothing invalidates `"*"`.
 */
import createQuery from 'openapi-react-query';
import type { paths } from './schema.js';
import type { ApiClient } from './client.js';

export type ApiQuery = ReturnType<typeof createQuery<paths>>;

export function createApiQuery(client: ApiClient): ApiQuery {
  return createQuery(client);
}
