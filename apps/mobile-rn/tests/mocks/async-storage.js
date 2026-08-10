/**
 * In-memory @react-native-async-storage/async-storage mock (CFG.12/13
 * tests): the subset the theme store uses, with the same `__store` /
 * `__reset` seams as the expo-secure-store mock, plus `__failAll` for the
 * unreadable-storage edge.
 */

const store = new Map();
let failAll = false;

function guard() {
  if (failAll) throw new Error('storage unavailable');
}

const AsyncStorage = {
  getItem: jest.fn(async (key) => {
    guard();
    return store.has(key) ? store.get(key) : null;
  }),
  setItem: jest.fn(async (key, value) => {
    guard();
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key) => {
    guard();
    store.delete(key);
  }),
  multiGet: jest.fn(async (keys) => {
    guard();
    return keys.map((key) => [key, store.has(key) ? store.get(key) : null]);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
};

module.exports = {
  __esModule: true,
  default: AsyncStorage,
  __store: store,
  __reset() {
    store.clear();
    failAll = false;
  },
  __setFailAll(value) {
    failAll = value;
  },
};
