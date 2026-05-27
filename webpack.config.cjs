const path = require('path');

// Resolved up front so the sideEffects rule below scopes to wherever upstream
// actually puts the bundler entry. If they move it, require.resolve throws
// here — better than silently dropping the override and letting production
// tree-shaking drop the wasm init (surface: runtime "null pointer passed to
// rust" deep in the parquet parse).
const GEOPARQUET_WASM_BUNDLER_DIR = path.dirname(
  require.resolve('@geoarrow/geoparquet-wasm/bundler/index.js'),
);

module.exports = [
  {
    mode: 'production',
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
          // declaration.
          include: GEOPARQUET_WASM_BUNDLER_DIR,
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
