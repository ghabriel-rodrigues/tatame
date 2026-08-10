import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';

// Quicksand self-hosted (no CDN) — the weights the design system uses.
import '@fontsource/quicksand/300.css';
import '@fontsource/quicksand/400.css';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
// Lumira CSS custom properties (glass, brand, belts) — the non-MUI var layer.
import '@tatame/design-system/tokens.css';

import { queryClient } from './api/api';
import { boot } from './auth/auth-store';
import { appRoutes } from './app/routes';
// CFG.8: theming is session-driven — the provider derives the palette from
// the active academy brand (default for plataforma/logged-out) and flips
// dark mode (CFG.10) from the persisted preference.
import { AppThemeProvider } from './app/AppThemeProvider';

// Silent session restore starts immediately; guards render the boot splash
// until the store leaves `booting` (web-04 boot sequence).
void boot();

const router = createBrowserRouter(appRoutes);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppThemeProvider>
  </StrictMode>,
);
