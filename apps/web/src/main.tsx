import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
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

import {
  applyBrand,
  createTatameTheme,
  derivePalette,
  TATAME_DEFAULT_BRAND,
} from '@tatame/design-system';
import { queryClient } from './api/api';
import { boot } from './auth/auth-store';
import { appRoutes } from './app/routes';

// One derivePalette() output feeds BOTH variable layers (ds-02): the Lumira
// vars via applyBrand and the MUI vars via createTatameTheme. Tenant branding
// (white-label) swaps TATAME_DEFAULT_BRAND per surface (e.g. /convite).
const derived = derivePalette(TATAME_DEFAULT_BRAND, 'light');
applyBrand(derived);
const theme = createTatameTheme(derived, 'light');

// Silent session restore starts immediately; guards render the boot splash
// until the store leaves `booting` (web-04 boot sequence).
void boot();

const router = createBrowserRouter(appRoutes);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
