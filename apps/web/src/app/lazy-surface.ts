/**
 * RLS.6 — code-split at the persona-surface boundary (web-01 decision).
 * `createSurface` wraps ONE dynamic `import()` per surface and hands out
 * `React.lazy` components backed by that single chunk, so each persona
 * surface (login/public, convite, console shell, admin, plataforma) is a
 * separate bundle and a Convite visitor never downloads console code.
 *
 * Once a surface module is in memory, lazy resolution goes through a
 * fulfilled thenable that React resolves synchronously — no Suspense
 * flash on intra-surface navigation, and the web-07 test preload seam
 * (`preloadSurfaces`) keeps the route suites timing-identical to the old
 * static imports.
 */
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-neutral component bound
type AnyComponent = ComponentType<any>;

const registry: Array<() => Promise<unknown>> = [];

export interface SurfaceHandle<M extends object> {
  /** Kick the chunk download (idempotent — used by the test preload seam). */
  load: () => Promise<M>;
  /** A `React.lazy` component for one export of the surface module. */
  component: <K extends keyof M>(
    name: K,
  ) => LazyExoticComponent<Extract<M[K], AnyComponent>>;
}

export function createSurface<M extends object>(
  loadModule: () => Promise<M>,
): SurfaceHandle<M> {
  let cached: M | undefined;
  const load = (): Promise<M> =>
    loadModule().then((module) => {
      cached = module;
      return module;
    });
  registry.push(load);

  function component<K extends keyof M>(
    name: K,
  ): LazyExoticComponent<Extract<M[K], AnyComponent>> {
    type LazyModule = { default: Extract<M[K], AnyComponent> };
    return lazy((): Promise<LazyModule> => {
      if (cached) {
        const resolved = { default: cached[name] } as LazyModule;
        // Fulfilled thenable: React.lazy's initializer observes resolution
        // synchronously, so an already-loaded surface renders without
        // suspending (React reads the sync `then` before checking status).
        return {
          then: (onFulfilled: (value: LazyModule) => unknown) =>
            onFulfilled(resolved),
        } as unknown as Promise<LazyModule>;
      }
      return load().then((module) => ({ default: module[name] }) as LazyModule);
    });
  }

  return { load, component };
}

/**
 * Test seam (web-07): resolve every registered surface chunk up front so
 * lazy routes render synchronously under jsdom — the route/RBAC suites
 * stay green unchanged. Import order guarantees `app/routes.tsx` has
 * registered its surfaces before any test calls this.
 */
export function preloadSurfaces(): Promise<unknown> {
  return Promise.all(registry.map((load) => load()));
}
