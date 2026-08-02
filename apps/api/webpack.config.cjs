const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    // The bundle is CommonJS but this package is "type": "module" — .cjs
    // keeps `node dist/main.cjs` working.
    filename: 'main.cjs',
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  externals: [
    // pnpm keeps per-project deps out of the root node_modules, so the
    // plugin's webpack-node-externals (rooted there) misses them. Externalize
    // every bare package request ourselves; workspace sources (@tatame/*,
    // @org/*) stay bundled. Native addons (@node-rs/argon2) must never be
    // bundled.
    ({ request }, callback) => {
      const isBare = request && !request.startsWith('.') && !request.startsWith('/');
      const isWorkspace = request && (request.startsWith('@tatame/') || request.startsWith('@org/'));
      if (isBare && !isWorkspace) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    },
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      // Server bundle: keep node_modules external — native addons like
      // @node-rs/argon2 cannot be bundled. Emitted as .cjs because this
      // package is "type": "module" (the bundle itself is CommonJS).
      externalDependencies: 'all',
      mergeExternals: true,
      outputFileName: 'main.cjs',
    }),
  ],
};
