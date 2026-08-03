/**
 * In-memory expo-secure-store mock (AUTH.18 tests): same async surface,
 * `__store`/`__reset` seams for assertions, and a `__failReads` switch for
 * the unreadable-keychain edge.
 */

const store = new Map();
let failReads = false;

module.exports = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key) => {
    if (failReads) throw new Error('keychain unavailable');
    return store.has(key) ? store.get(key) : null;
  }),
  setItemAsync: jest.fn(async (key, value) => {
    store.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key) => {
    store.delete(key);
  }),
  __store: store,
  __reset() {
    store.clear();
    failReads = false;
  },
  __setFailReads(value) {
    failReads = value;
  },
};
