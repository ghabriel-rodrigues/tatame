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
  require.resolve('@react-native/jest-preset/jest/resolver.js', { paths: [jestExpoDir] }),
);

module.exports = (request, options) => {
  if (
    options.basedir.includes('react-native-worklets') ||
    request.includes('react-native-worklets')
  ) {
    options = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes('native')),
    };
  }
  return rnResolver(request, options);
};
