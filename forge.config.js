const path = require('path');
const fs = require('fs');

module.exports = {
  // Ports are configurable to avoid hardcoding and collisions.
  // These are only used for Electron Forge + webpack dev.
  // Examples:
  // - FORGE_WEBPACK_PORT=3100 FORGE_LOGGER_PORT=9100
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/@remotion/compositor-*/**',
    },
    appBundleId: 'com.bokeh.app',
    name: 'Bokeh',
    executableName: 'bokeh',
    icon: path.join(__dirname, 'public/brand/dock_icon'),
    appCategoryType: 'public.app-category.productivity',
    darwinDarkModeSupport: true,
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Bokeh Project',
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
          LSTypeIsPackage: true,
          LSItemContentTypes: ['com.bokeh.project'],
          CFBundleTypeExtensions: ['bokeh'],
          CFBundleTypeIconFile: 'icon'
        }
      ],
      UTExportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'com.bokeh.project',
          UTTypeDescription: 'Bokeh Project',
          UTTypeConformsTo: ['public.directory'],
          UTTypeTagSpecification: {
            'public.filename-extension': ['bokeh']
          }
        }
      ]
    },
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
        port: Number.parseInt(process.env.FORGE_WEBPACK_PORT || '', 10) || 3001,
        loggerPort: Number.parseInt(process.env.FORGE_LOGGER_PORT || '', 10) || 9001,
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
