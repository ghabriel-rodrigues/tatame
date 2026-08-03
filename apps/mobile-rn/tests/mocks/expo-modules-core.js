/**
 * expo-modules-core wrapper for jest: identical to the real module except
 * `requireNativeViewManager`, which several SDK 57 packages (expo-router's
 * iOS stack toolbar, expo-glass-effect) call at module scope — the real
 * implementation throws without a native runtime. Resolved via the custom
 * jest resolver (jest.resolver.js), which sends every request for
 * "expo-modules-core" here EXCEPT the one below (basedir check), avoiding
 * mapper recursion.
 */

const { View } = require('react-native');
const actual = require('expo-modules-core');

module.exports = {
  __esModule: true,
  ...actual,
  requireNativeViewManager: () => View,
};
