/**
 * TokenStore — the ONLY secure-store call site (rn-04). Stores exactly one
 * value: the opaque refresh token (well under secure-store's 2 KB per-key
 * limit; never user/profile JSON). Accessibility is device-only,
 * when-unlocked — tokens never migrate to a new device or iCloud.
 */

import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'tatame.refreshToken';

/**
 * Isolated options object (rn-04): biometric gating (`requireAuthentication`)
 * is a v1 fog — flipping it on later is a change to this object only.
 */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY, SECURE_OPTIONS);
  } catch {
    // Unreadable entry (keychain migration edge) === no session.
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, SECURE_OPTIONS);
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, SECURE_OPTIONS);
  } catch {
    // Deleting an absent key must never break logout.
  }
}
