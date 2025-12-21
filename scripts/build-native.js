#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

if (process.platform !== 'darwin') {
  console.log('Skipping native modules (not macOS)');
  process.exit(0);
}

try {
  // Build native module
  execSync('node-gyp rebuild', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  // Rebuild for Electron
  execSync('npx electron-rebuild', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  console.log('✅ Native modules built');
} catch (error) {
  console.error('Native module build failed. Install Xcode Command Line Tools: xcode-select --install');
  process.exit(1);
}