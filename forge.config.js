const path = require('path');
const fs = require('fs');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/@remotion/compositor-*/**',
    },
    appBundleId: 'com.bokeh.app',
    name: 'Bokeh',
    executableName: 'bokeh',
    icon: path.join(__dirname, 'assets', 'icon'),
    appCategoryType: 'public.app-category.productivity',
    darwinDarkModeSupport: true,
    osxSign: {
      hardenedRuntime: false,
      entitlements: path.join(__dirname, 'entitlements.plist'),
      'entitlements-inherit': path.join(__dirname, 'entitlements.plist'),
    },
    osxNotarize: false, // Disable for development
    extraResource: [
      path.join(__dirname, 'out')
    ],
    ignore: [
      /^\/src/,
      /^\/electron\/src/,
      /^\/\.next/,
      /^\/node_modules\/\.cache/,
      /^\/\.git/,
      /^\/\.vscode/,
      /^\/tests/,
      /^\/scripts/,
      /^\/.*.md$/,
      /^\/forge.config.js$/,
    ],
  },
  rebuildConfig: {
    onlyModules: ['uiohook-napi'],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Bokeh',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Bokeh Team',
          homepage: 'https://bokeh.app',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './public/index.html',
              js: './src/renderer.tsx',
              name: 'main_window',
              preload: {
                js: './electron/preload.ts',
              },
            },
          ],
        },
        port: 3001,
        loggerPort: 9001,
      },
    },
  ],
  hooks: {
    prePackage: async (forgeConfig, platform, arch) => {
      // Build Next.js before packaging
      console.log('Building Next.js application...');
      const { execSync } = require('child_process');
      execSync('npm run build', { stdio: 'inherit' });
    },
  },
};