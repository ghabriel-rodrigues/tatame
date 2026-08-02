/* Jest mock: expo-linear-gradient renders a native view; use a plain View. */
const React = require('react');
const { View } = require('react-native');

exports.LinearGradient = ({ children, ...props }) => React.createElement(View, props, children);
