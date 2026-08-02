/**
 * Metro config (rn-01): expo/metro-config auto-detects the pnpm workspace
 * root (watchFolders/nodeModulesPaths) since SDK 52 — no manual monorepo
 * wiring.
 *
 * One addition: singleton pinning. packages/design-system declares the
 * native runtime deps as type-level devDependencies (typecheck needs them),
 * so pnpm's isolated linker materializes a SECOND peer-resolution instance
 * of each under the package. Without pinning, imports inside DS source would
 * bundle those copies — duplicating react/reanimated singletons. Resolve
 * them from the app instead.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const SINGLETONS = [
  'react',
  'react-native',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-svg',
  'expo-blur',
  'expo-linear-gradient',
  'lucide-react-native',
];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  const pinned = SINGLETONS.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  if (pinned) {
    return resolve(
      { ...context, originModulePath: path.join(__dirname, 'package.json') },
      moduleName,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
