const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    index: './electron/main/index.ts',
    'export-worker': './electron/main/export-worker.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'out'),
          to: path.resolve(__dirname, '.webpack/main/out'),
        },
        {
          from: path.resolve(__dirname, 'build/Release/cursor_detector.node'),
          to: path.resolve(__dirname, '.webpack/main/build/Release/cursor_detector.node'),
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  externals: [
    'uiohook-napi'
  ],
  target: 'electron-main',
  node: {
    __dirname: false,
    __filename: false,
  },
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
    filename: '[name].js',
  },
};