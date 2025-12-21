/**
 * Remotion configuration for bundling and rendering
 */

import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setScale(1);
Config.setJpegQuality(90);
Config.setOverwriteOutput(true);

// Webpack configuration for Remotion bundler
Config.overrideWebpackConfig((currentConfig) => {
  const path = require('path');
  
  return {
    ...currentConfig,
    resolve: {
      ...currentConfig.resolve,
      alias: {
        ...currentConfig.resolve?.alias,
        '@': path.resolve(__dirname, 'src'),
        '@/types': path.resolve(__dirname, 'src/types'),
        '@/lib': path.resolve(__dirname, 'src/lib'),
        '@/remotion': path.resolve(__dirname, 'src/remotion'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    module: {
      ...currentConfig.module,
      rules: [
        ...(currentConfig.module?.rules || []),
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
      ],
    },
  };
});