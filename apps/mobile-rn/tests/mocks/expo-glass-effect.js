/**
 * expo-glass-effect mock: expo-router's native-stack fork imports it on iOS
 * and it requires a native view manager at module scope, which jest's
 * expo-modules-core mock cannot provide. Plain Views + "not available".
 */

const React = require('react');
const { View } = require('react-native');

const passthrough = ({ children, ...props }) =>
  React.createElement(View, props, children);

module.exports = {
  GlassView: passthrough,
  GlassContainer: passthrough,
  GlassStyle: {},
  isLiquidGlassAvailable: () => false,
};
