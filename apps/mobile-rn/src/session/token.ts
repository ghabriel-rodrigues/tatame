/**
 * Memory-only access-token holder (rn-04, mirrors web-04's token.ts). The
 * access token never touches disk — an in-memory token dies with the
 * process, which is the correct blast radius. The auth-lost event is the
 * seam between the shared client's single-flight 401 handling and the
 * session store (which maps it to anon + cache clear).
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

type AuthLostListener = () => void;
const authLostListeners = new Set<AuthLostListener>();

export function onAuthLost(listener: AuthLostListener): () => void {
  authLostListeners.add(listener);
  return () => authLostListeners.delete(listener);
}

export function emitAuthLost(): void {
  for (const listener of [...authLostListeners]) listener();
}
