/**
 * TokenStore (AUTH.18): the single secure-store seam — refresh token only,
 * device-only accessibility, logout-safe deletes.
 */

import * as SecureStore from 'expo-secure-store';
import {
  clearRefreshToken,
  getRefreshToken,
  setRefreshToken,
} from '../../src/session/token-store';

const mock = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  __store: Map<string, string>;
  __reset: () => void;
  __setFailReads: (value: boolean) => void;
};

describe('token-store', () => {
  beforeEach(() => {
    mock.__reset();
    jest.clearAllMocks();
  });

  it('stores and reads the refresh token under the tatame key', async () => {
    await setRefreshToken('rt-1');
    expect(await getRefreshToken()).toBe('rt-1');
    expect(mock.__store.get('tatame.refreshToken')).toBe('rt-1');
  });

  it('uses device-only when-unlocked accessibility (no cloud migration)', async () => {
    await setRefreshToken('rt-1');
    expect(mock.setItemAsync).toHaveBeenCalledWith(
      'tatame.refreshToken',
      'rt-1',
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });

  it('clears the token and returns null afterwards', async () => {
    await setRefreshToken('rt-1');
    await clearRefreshToken();
    expect(await getRefreshToken()).toBeNull();
    expect(mock.__store.size).toBe(0);
  });

  it('treats an unreadable keychain entry as no session', async () => {
    await setRefreshToken('rt-1');
    mock.__setFailReads(true);
    expect(await getRefreshToken()).toBeNull();
  });

  it('tolerates deleting when nothing is stored', async () => {
    await expect(clearRefreshToken()).resolves.toBeUndefined();
  });
});
