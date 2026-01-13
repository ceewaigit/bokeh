#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

const preferredPort = (() => {
  const raw = process.env.NEXT_PORT || process.env.PORT || process.env.DEV_SERVER_PORT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
})();

// Try ports in order (prefer explicit env port first)
const portsToTry = [
  ...(preferredPort ? [preferredPort] : []),
  3000, 3001, 3002, 3003, 3004
].filter((p, idx, arr) => arr.indexOf(p) === idx);
let detectedPort = null;

// Track child processes for cleanup
let nextProcess = null;
let electronProcess = null;
let isShuttingDown = false;

function checkPort(port) {
  return new Promise((resolve) => {
    const options = {
      host: '127.0.0.1',
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

/**
 * Gracefully shutdown all child processes
 */
function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('\n🛑 Shutting down...');

  // Kill Next.js process
  if (nextProcess && !nextProcess.killed) {
    console.log('  Stopping Next.js server...');
    // On Windows, use taskkill for the process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', nextProcess.pid, '/f', '/t'], { stdio: 'ignore' });
    } else {
      // Send SIGTERM to process group (negative PID)
      try {
        process.kill(-nextProcess.pid, 'SIGTERM');
      } catch (e) {
        // Fallback to just the process
        nextProcess.kill('SIGTERM');
      }
    }
  }

  // Kill Electron process
  if (electronProcess && !electronProcess.killed) {
    console.log('  Stopping Electron...');
    electronProcess.kill('SIGTERM');
  }

  // Give processes time to exit gracefully, then force exit
  setTimeout(() => {
    console.log('✅ Cleanup complete');
    process.exit(exitCode);
  }, 1000);
}

// Handle various shutdown signals
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

async function main() {
  try {
    // Start Next.js as a child process (instead of relying on concurrently)
    console.log('🚀 Starting Next.js dev server...');
    nextProcess = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FORCE_COLOR: '1'
      },
      // Create a new process group so we can kill all children
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32'
    });

    // Pipe Next.js output with prefix
    nextProcess.stdout.on('data', (data) => {
      process.stdout.write(`[next] ${data}`);
    });
    nextProcess.stderr.on('data', (data) => {
      process.stderr.write(`[next] ${data}`);
    });

    nextProcess.on('error', (err) => {
      console.error('❌ Failed to start Next.js:', err.message);
      shutdown(1);
    });

    nextProcess.on('exit', (code) => {
      if (!isShuttingDown) {
        console.log(`⚠️ Next.js exited unexpectedly with code ${code}`);
        shutdown(code || 1);
      }
    });

    // Wait for Next.js to be ready
    const port = await waitForNext();

    // Set the port as an environment variable for Electron
    process.env.NEXT_PORT = port;

    // Now start Electron with memory options
    console.log('🚀 Starting Electron with Next.js on port', port);
    electronProcess = spawn('electron', ['.'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NEXT_PORT: port.toString(),
        NODE_OPTIONS: '--max-old-space-size=4096 --expose-gc'
      }
    });

    electronProcess.on('close', (code) => {
      console.log(`\n📱 Electron exited with code ${code}`);
      shutdown(code || 0);
    });

    electronProcess.on('error', (err) => {
      console.error('❌ Failed to start Electron:', err.message);
      shutdown(1);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    shutdown(1);
  }
}

main();
