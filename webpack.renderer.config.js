const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
  ignoreWarnings: [
    // Ignore critical dependency warnings from @ffmpeg/ffmpeg
    /Critical dependency: the request of a dependency is an expression/,
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              jsx: 'react-jsx',
              module: 'esnext',
              target: 'es2015'
            }
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    fallback: {
      // Required for @ffmpeg/ffmpeg in browser environment
      'fs': false,
      'path': false,
      'crypto': false,
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: path.resolve(__dirname, 'src/process-shim.js'),
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'global': 'window',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'out'),
          to: 'out',
        },
        {
          from: path.resolve(__dirname, 'public'),
          to: 'public',
          globOptions: {
            ignore: ['**/index.html'],
          },
        },
        // Explicitly copy cursors folder to ensure it's included
        {
          from: path.resolve(__dirname, 'public/cursors'),
          to: 'cursors',
        },
      ],
    }),
  ],
  target: 'web', // Use 'web' since we have contextIsolation enabled
  node: false, // Disable Node.js polyfills for isolated context
  devServer: {
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    devMiddleware: {
      writeToDisk: true,
    },
    static: {
      directory: path.join(__dirname, 'out'),
      publicPath: '/',
    },
    compress: true,
    hot: false, // Disable HMR to prevent require errors
    liveReload: false, // Disable live reload
    port: 3001,
  },
};