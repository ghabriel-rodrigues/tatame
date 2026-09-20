/**
 * Jest (jest-expo) — rn-07 direction: the DS native components are tested
 * here, through the app, because the monorepo's vitest runner cannot
 * transform React Native's untranspiled Flow/ESM source; jest-expo is the
 * Expo-blessed preset with the native-module mocks (and its SDK 57 preset
 * is already pnpm-aware: everything under node_modules/.pnpm is
 * babel-transformed).
 *
 * `resolver` composes the react-native-worklets jest resolution rule with
 * the preset's @react-native resolver (see jest.resolver.js) — required for
 * Reanimated 4's `setUpTests()` (jest-setup.js).
 *
 * `moduleNameMapper` singletons: the design-system package declares the
 * native deps as devDependencies (type resolution), so pnpm's isolated
 * linker materializes a SECOND peer-resolution instance of each under the
 * package. Imports from DS source must land on the app's instance (mock
 * registry and React renderer are keyed per resolved path). expo-blur /
 * expo-linear-gradient map to plain-View mocks (native view managers,
 * rn-03's single glass mock point).
 */

module.exports = {
  preset: 'jest-expo',
  resolver: '<rootDir>/jest.resolver.js',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  // Interaction-heavy suites regularly clear jest's 5s default locally but
  // not on 2-core CI runners under full parallel load — a per-test chase
  // (responsavel-eventos was the first) doesn't scale; this covers the class.
  testTimeout: 20_000,
  testMatch: [
    '<rootDir>/tests/**/*.test.@(ts|tsx)',
    '<rootDir>/src/**/*.test.@(ts|tsx)',
  ],
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-native-reanimated$':
      '<rootDir>/node_modules/react-native-reanimated',
    '^react-native-reanimated/(.*)$':
      '<rootDir>/node_modules/react-native-reanimated/$1',
    '^react-native-worklets$': '<rootDir>/node_modules/react-native-worklets',
    '^react-native-worklets/(.*)$':
      '<rootDir>/node_modules/react-native-worklets/$1',
    '^react-native-svg$': '<rootDir>/node_modules/react-native-svg',
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native',
    '^expo-blur$': '<rootDir>/tests/mocks/expo-blur.js',
    '^expo-linear-gradient$': '<rootDir>/tests/mocks/expo-linear-gradient.js',
    '^expo-secure-store$': '<rootDir>/tests/mocks/expo-secure-store.js',
    '^expo-camera$': '<rootDir>/tests/mocks/expo-camera.js',
    '^expo-clipboard$': '<rootDir>/tests/mocks/expo-clipboard.js',
    '^expo-glass-effect$': '<rootDir>/tests/mocks/expo-glass-effect.js',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/tests/mocks/async-storage.js',
  },
};
