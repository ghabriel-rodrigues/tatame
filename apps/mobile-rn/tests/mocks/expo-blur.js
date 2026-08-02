/* Jest mock: expo-blur's BlurView is a native view with no jest-expo mock. */
const React = require('react');
const { View } = require('react-native');

exports.BlurView = ({ children, ...props }) => React.createElement(View, props, children);
