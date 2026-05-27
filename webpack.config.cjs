const path = require('path');

// Fail-fast assertion: the @geoarrow/geoparquet-wasm bundler entry must
// exist where we expect it, because the `sideEffects: true` override in
// `module.rules` below is keyed off that exact path. If upstream moves
// the file, the override silently stops applying and the `__wbg_set_wasm`
// call gets tree-shaken, producing runtime "wasm is undefined" errors.
const GEOPARQUET_WASM_BUNDLER_ENTRY = require.resolve(
  '@geoarrow/geoparquet-wasm/bundler/index.js'
);

module.exports = [
  {
    mode: 'development',
    entry: './src/index.ts',
    output: {
      filename: './bundle.js',
      library: 'EcoscopeDeckglExtensions',
      libraryTarget: 'umd',
      globalObject: 'globalThis',
      umdNamedDefine: true
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      // Source uses explicit `.js` on relative imports for Node ESM-strict
      // compat (Next.js, plain Node, etc.). Map those back to `.ts`/`.tsx`
      // when webpack resolves against our source tree.
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.jsx': ['.tsx', '.jsx'],
      },
    },
    target: 'web',
    experiments: {
      asyncWebAssembly: true,
    },
    externals: {
      "@deck.gl/core": "deck",
      "@deck.gl/layers": "deck",
      "@deck.gl/geo-layers": "deck",
      "@deck.gl/widgets": "deck",
      "@deck.gl/aggregation-layers": "deck",
    },
    devServer: {
      contentBase: __dirname,
      writeToDisk: true,
      port: 8080
    },
    module:{
      rules: [
        {
          // Scope ESM extension-strictness relaxation to upstream deps that
          // ship .js files without the .js suffix in their internal imports
          // (the @geoarrow/* packages). Keeping it scoped means our own code
          // still has to be spec-correct.
          test: /\.m?js$/,
          include: /node_modules[\\/]@geoarrow[\\/]/,
          resolve: { fullySpecified: false },
        },
        {
          // @geoarrow/geoparquet-wasm's bundler entry has a top-level
          // __wbg_set_wasm(wasm) call that initializes the wasm instance.
          // Upstream's package.json sideEffects array lists "./index.js" but
          // the bundler build lives at "./bundler/index.js" — so under
          // production tree-shaking, webpack would drop the entire module
          // top-level (including the wasm init) and runtime calls would hit
          // "null pointer passed to rust". This rule overrides the package
          // declaration. Currently a no-op under `mode: 'development'` (dev
          // mode doesn't enforce sideEffects-based tree-shaking) but
          // load-bearing if/when we switch to production mode.
          include: /node_modules[\\/]@geoarrow[\\/]geoparquet-wasm[\\/]bundler/,
          sideEffects: true,
        },
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        }
      ],
    }
  }
];
