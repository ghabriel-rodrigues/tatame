/**
 * Chained jest resolver: react-native-worklets' extension filtering (its
 * modules must resolve to the JS fallbacks, not `.native.ts`, under jest —
 * see react-native-worklets/jest/resolver.js) on top of the
 * @react-native/jest-preset resolver that jest-expo's preset configures
 * (jest supports a single `resolver`, so the two must be composed).
 */

const path = require('path');

const jestExpoDir = path.dirname(require.resolve('jest-expo/package.json'));
const rnResolver = require(
  require.resolve('@react-native/jest-preset/jest/resolver.js', {
    paths: [jestExpoDir],
  }),
);

const MOCKS_DIR = path.join(__dirname, 'tests', 'mocks');

module.exports = (request, options) => {
  // Route "expo-modules-core" to the jest wrapper (tests/mocks) that stubs
  // `requireNativeViewManager` — except when the wrapper itself asks for
  // the real module (basedir check), which would otherwise recurse.
  if (
    request === 'expo-modules-core' &&
    !options.basedir.startsWith(MOCKS_DIR)
  ) {
    return path.join(MOCKS_DIR, 'expo-modules-core.js');
  }
  if (
    options.basedir.includes('react-native-worklets') ||
    request.includes('react-native-worklets')
  ) {
    options = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes('native')),
    };
  }
  try {
    return rnResolver(request, options);
  } catch (error) {
    // @tatame/shared is ESM-style TS source: relative imports carry the
    // compiled `.js` extension while the files on disk are `.ts`. Map the
    // extension before giving up (TypeScript's own resolution rule).
    if (/\.js$/.test(request)) {
      for (const ext of ['.ts', '.tsx']) {
        try {
          return rnResolver(request.replace(/\.js$/, ext), options);
        } catch {
          // fall through to the original error
        }
      }
    }
    throw error;
  }
};
