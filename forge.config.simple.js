const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'Bokeh',
    executableName: 'bokeh',
    asar: false, // Keep false for now to debug easier
    icon: path.join(__dirname, 'assets', 'icon'),
    appBundleId: 'com.bokeh.app',
    appCategoryType: 'public.app-category.productivity',
    darwinDarkModeSupport: true,
    protocols: [
      {
        name: 'Bokeh',
        schemes: ['bokeh']
      }
    ],
    osxSign: false, // Disable for development
    osxNotarize: false, // Disable for development
    // Include the built Next.js output
    ignore: [
      /^\/src($|\/)/,
      /^\/\.next($|\/)/,
      /^\/.git($|\/)/,
      /^\/node_modules\/\.cache($|\/)/
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-deb',
      config: {}
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {}
    }
  ],
  hooks: {
    generateAssets: async () => {
      // Build Next.js app before packaging
      const { execSync } = require('child_process');
      console.log('Building Next.js app...');
      execSync('npm run build', { stdio: 'inherit' });
      console.log('Building Electron TypeScript files...');
      execSync('npm run build:electron', { stdio: 'inherit' });
    }
  }
};