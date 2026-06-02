const path = require('path');

// Resolved up front so the sideEffects rule below scopes to wherever upstream
// actually puts the bundler entry. 
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
          test: /\.m?js$/,
          include: /node_modules[\\/]@geoarrow[\\/]/,
          resolve: { fullySpecified: false },
        },
        {
          // This rule overrides the upstream package declaration. 
          // @geoarrow/geoparquet-wasm's package.json sideEffects 
          // array lists "./index.js" but the bundler build lives at 
          // "./bundler/index.js" — so under production tree-shaking, 
          // webpack drops the entire module top-level (including the wasm init)
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
