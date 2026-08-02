/**
 * Memory-only access-token holder (web-04). The token never touches
 * localStorage/sessionStorage — XSS must not be able to exfiltrate it. The
 * auth-lost event is the seam between the shared client's 401 handling and
 * the auth store (which maps it to anon + cache clear).
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
