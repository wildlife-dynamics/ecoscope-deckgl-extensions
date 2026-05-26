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
    },
    target: 'web',
    experiments: {
      asyncWebAssembly: true,
      syncWebAssembly: true,
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
          test: /\.m?js$/,
          resolve: { fullySpecified: false },
        },
        {
          // @geoarrow/geoparquet-wasm's bundler entry has a top-level
          // __wbg_set_wasm(wasm) call that gets tree-shaken otherwise — its
          // package.json sideEffects array doesn't include the bundler/ entry.
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
