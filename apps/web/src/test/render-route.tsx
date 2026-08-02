/**
 * renderRoute helper (web-07): renders a real router surface — the actual
 * route objects — inside the real provider stack, with the auth store
 * seeded. Assertions are on what the user sees, never hook internals.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { render, type RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { MeResponse } from '@tatame/shared';
import {
  createTatameTheme,
  derivePalette,
  TATAME_DEFAULT_BRAND,
} from '@tatame/design-system';
import { appRoutes } from '../app/routes';
import { queryClient } from '../api/api';
import { authTestApi } from '../auth/auth-store';

const theme = createTatameTheme(derivePalette(TATAME_DEFAULT_BRAND, 'light'), 'light');

export interface RenderRouteOptions {
  /**
   * Auth store seed: a session (authed), null/undefined (anon) or 'booting'.
   */
  session?: MeResponse | null | 'booting';
}

export type RenderRouteResult = RenderResult & {
  router: ReturnType<typeof createMemoryRouter>;
};

export function renderRoute(path: string, options: RenderRouteOptions = {}): RenderRouteResult {
  if (options.session === 'booting') {
    authTestApi.seed({ status: 'booting', session: null }, null);
  } else if (options.session) {
    authTestApi.seed({ status: 'authed', session: options.session });
  } else {
    authTestApi.seed({ status: 'anon', session: null }, null);
  }

  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const utils = render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { router, ...utils };
}
