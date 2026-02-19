module.exports = [
  {
    mode: 'development',
    entry: './src/index.ts',
    output: {
      filename: './bundle.js',
      library: 'ecoscopeDeckWidgets',
      libraryTarget: 'umd',
      globalObject: 'self',
      umdNamedDefine: true
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
    },
    target: 'web',
    externals: {
      "@deck.gl/core": "deck",
      "@deck.gl/layers": "deck",
      "@deck.gl/geo-layers": "deck",
      "@deck.gl/widgets": "deck",
    },
    devServer: {
      contentBase: __dirname,
      writeToDisk: true,
      port: 8080
    },
    module:{
      rules: [
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