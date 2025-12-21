#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

// Try ports in order
const portsToTry = [3000, 3001, 3002, 3003, 3004];
let detectedPort = null;

function checkPort(port) {
  return new Promise((resolve) => {
    const options = {
      host: 'localhost',
      port: port,
      path: '/',
      method: 'GET',
      timeout: 1000
    };

    const req = http.request(options, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function waitForNext(maxAttempts = 30) {
  console.log('⏳ Waiting for Next.js dev server to start...');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const port of portsToTry) {
      const isRunning = await checkPort(port);
      if (isRunning) {
        console.log(`✅ Next.js is running on port ${port}`);
        detectedPort = port;
        return port;
      }
    }
    
    // Wait 1 second before trying again
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (attempt % 5 === 0 && attempt > 0) {
      console.log(`⏳ Still waiting... (${attempt}/${maxAttempts})`);
    }
  }
  
  throw new Error('Next.js dev server did not start in time');
}

async function main() {
  try {
    const port = await waitForNext();
    
    // Set the port as an environment variable for Electron
    process.env.NEXT_PORT = port;
    
    // Now start Electron with memory options
    console.log('🚀 Starting Electron with Next.js on port', port);
    const electron = spawn('electron', ['.'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NEXT_PORT: port.toString(),
        NODE_OPTIONS: '--max-old-space-size=4096 --expose-gc'
      }
    });
    
    electron.on('close', (code) => {
      process.exit(code);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();