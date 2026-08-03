/**
 * Schema-derived TanStack Query hooks (ENR.17-20, mirrors web's api.ts):
 * openapi-react-query over the shared client — canonical
 * `[method, path, params]` keys, no hand-rolled key factories. Every
 * mutation declares its invalidation list at its call site.
 */

import { createApiQuery } from '@tatame/shared';
import { apiClient } from '../session/api';

export const api = createApiQuery(apiClient);
