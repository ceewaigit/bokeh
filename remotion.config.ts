import { Config } from '@remotion/cli/config';
import path from 'path';

Config.setVideoImageFormat('jpeg');
Config.setScale(1);
Config.setJpegQuality(90);
Config.setOverwriteOutput(true);

// Webpack configuration for Remotion bundler
Config.overrideWebpackConfig((currentConfig) => {
  const srcPath = path.resolve(process.cwd(), 'src');

  return {
    ...currentConfig,
    resolve: {
      ...currentConfig.resolve,
      alias: {
        ...currentConfig.resolve?.alias,
        '@': srcPath,
        '@/types': path.resolve(srcPath, 'types'),
        '@/lib': path.resolve(srcPath, 'lib'),
        '@/remotion': path.resolve(srcPath, 'remotion'),
        '@/stores': path.resolve(srcPath, 'stores'),
        '@/features': path.resolve(srcPath, 'features'),
        '@/components': path.resolve(srcPath, 'components'),
        '@/shared': path.resolve(srcPath, 'shared'),
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
