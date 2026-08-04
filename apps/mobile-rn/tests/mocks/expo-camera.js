/**
 * Jest mock: expo-camera (ATT.15 tests). The jest/simulator environment has
 * no camera — `useCameraPermissions` reports "unavailable" (null permission)
 * by default so the sheet exercises its graceful degradation to code entry.
 * `__setPermission`/`__scan` seams let a test grant the permission and fire
 * a scanned QR payload.
 */

const React = require('react');
const { View } = require('react-native');

let permission = null;
let lastScanHandler = null;
const requestPermission = jest.fn(async () => permission);

exports.CameraView = ({ children, onBarcodeScanned, ...props }) => {
  lastScanHandler = onBarcodeScanned ?? null;
  return React.createElement(View, props, children);
};

exports.useCameraPermissions = () => [permission, requestPermission];

exports.__setPermission = (next) => {
  permission = next;
};
exports.__scan = (data) => {
  if (lastScanHandler) lastScanHandler({ data, type: 'qr' });
};
exports.__reset = () => {
  permission = null;
  lastScanHandler = null;
  requestPermission.mockClear();
};
