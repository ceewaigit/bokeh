/**
 * Local HTTP server for serving video files with Range support
 * Uses Express and serve-static for robust, secure file serving
 */

import express from 'express';
import serveStatic from 'serve-static';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';

// Token storage with expiry
interface TokenEntry {
  absPath: string;
  expiresAt: number;
}

const TOKENS = new Map<string, TokenEntry>();

// Singleton server instance
let serverInstance: {
  app: express.Application;
  server: any;
  port: number;
} | null = null;

/**
 * Middleware to check Host header against DNS rebinding attacks
 */
const hostGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const host = req.headers.host;
  if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'))) {
    return next();
  }
  res.status(403).send('Forbidden');
};

/**
 * Middleware to check bearer token authentication
 */
const tokenAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.params.token;
  
  const entry = TOKENS.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(401).send('Unauthorized');
  }
  
  // Attach the file path to the request for the serve handler
  (req as any).videoPath = entry.absPath;
  next();
};

/**
 * Start the video HTTP server with security and Range support
 */
async function startVideoServer(): Promise<{
  port: number;
  registerFile: (absPath: string, ttlMs?: number, type?: FileType) => string;
  close: () => void;
}> {
  // Return existing server if already running
  if (serverInstance) {
    return {
      port: serverInstance.port,
      registerFile: createRegisterFunction(serverInstance.port),
      close: () => closeServer()
    };
  }

  const app = express();
  
  // Security middleware - apply to all routes
  app.use(hostGuard);
  
  // CORS headers for Remotion
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Range, Authorization');
    next();
  });
  
  // Handle OPTIONS preflight - Express 5 requires specific path pattern
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  
  // Video serving route with token auth
  app.get('/v/:token', tokenAuth, (req, res, next) => {
    const videoPath = (req as any).videoPath;
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).send('Not Found');
    }
    
    // Use serve-static with proper options for video streaming
    const handler = serveStatic(path.dirname(videoPath), {
      acceptRanges: true,
      cacheControl: false,
      etag: true,
      lastModified: true,
      index: false,
      fallthrough: false,
      setHeaders: (res, filepath) => {
        const ext = path.extname(filepath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.mkv': 'video/x-matroska',
          '.m4v': 'video/x-m4v',
          '.avi': 'video/x-msvideo',
          '.ogv': 'video/ogg'
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      }
    });
    
    // Rewrite request URL to just the filename
    req.url = '/' + path.basename(videoPath);
    handler(req, res, next);
  });

  // Metadata JSON serving route with token auth
  app.get('/m/:token', tokenAuth, (req, res, next) => {
    const metadataPath = (req as any).videoPath;

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).send('Not Found');
    }

    // Use serve-static for JSON files
    const handler = serveStatic(path.dirname(metadataPath), {
      acceptRanges: false,  // JSON doesn't need range requests
      cacheControl: true,
      etag: true,
      lastModified: true,
      index: false,
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader('Content-Type', 'application/json');
      }
    });

    // Rewrite request URL to just the filename
    req.url = '/' + path.basename(metadataPath);
    handler(req, res, next);
  });

  // Start server on random port, bound to loopback only
  const server = await new Promise<any>((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      resolve(srv);
    });
    srv.on('error', reject);
  });
  
  const address = server.address() as AddressInfo;
  const port = address.port;
  
  console.log(`[VideoServer] Started on http://127.0.0.1:${port}`);
  
  // Store server instance
  serverInstance = { app, server, port };
  
  // Dynamic cleanup based on token expiration times
  // Check more frequently when tokens exist, less when empty
  let cleanupInterval: NodeJS.Timeout | null = null;
  let serverClosed = false;  // Guard against cleanup after server close

  const scheduleCleanup = () => {
    // CRITICAL: Don't schedule cleanup if server has been closed
    if (serverClosed) return;

    if (cleanupInterval) clearTimeout(cleanupInterval);

    if (TOKENS.size === 0) {
      // No tokens, check again in 1 minute
      cleanupInterval = setTimeout(() => {
        scheduleCleanup();
      }, 60 * 1000);
      return;
    }
    
    // Find the nearest expiration time
    let nearestExpiry = Infinity;
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, entry] of TOKENS) {
      if (entry.expiresAt <= now) {
        // Already expired, clean it up
        TOKENS.delete(token);
        cleaned++;
      } else {
        nearestExpiry = Math.min(nearestExpiry, entry.expiresAt);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[VideoServer] Cleaned up ${cleaned} expired tokens`);
    }
    
    // Schedule next cleanup just after the nearest expiration
    // Add 1 second buffer to ensure token has expired
    const nextCheckIn = nearestExpiry === Infinity 
      ? 60 * 1000 // No tokens, check in 1 minute
      : Math.max(1000, nearestExpiry - now + 1000); // At least 1 second
    
    cleanupInterval = setTimeout(() => {
      scheduleCleanup();
    }, nextCheckIn);
  };
  
  // Start the cleanup scheduler
  scheduleCleanup();
  
  // Make scheduleCleanup available globally for registerFile to trigger
  (global as any).scheduleCleanup = scheduleCleanup;
  
  // Clear cleanup on server close
  server.on('close', () => {
    serverClosed = true;  // Prevent any future cleanup scheduling
    if (cleanupInterval) {
      clearTimeout(cleanupInterval);
      cleanupInterval = null;
    }
    delete (global as any).scheduleCleanup;
    // Reset serverPromise so getVideoServer() can create a new server if needed
    serverPromise = null;
  });
  
  return {
    port,
    registerFile: createRegisterFunction(port),
    close: () => closeServer()
  };
}

/** File type for registration */
type FileType = 'video' | 'metadata';

/**
 * Create a register function for the given port
 */
function createRegisterFunction(port: number) {
  return (absPath: string, ttlMs?: number, type: FileType = 'video'): string => {
    // Default TTL based on use case - longer for exports
    // This should be passed explicitly by the caller
    const actualTtl = ttlMs || 30 * 60 * 1000; // 30 minutes default
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + actualTtl;

    TOKENS.set(token, {
      absPath,
      expiresAt
    });

    // Use /v/ for video and /m/ for metadata
    const route = type === 'metadata' ? 'm' : 'v';
    const url = `http://127.0.0.1:${port}/${route}/${token}`;
    console.log(`[VideoServer] Registered ${type}: ${path.basename(absPath)} -> ${url} (TTL: ${Math.round(actualTtl/1000)}s)`);

    // Trigger cleanup schedule in case this is the first/only token
    if (serverInstance) {
      process.nextTick(() => {
        // Use nextTick to avoid recursion if called during cleanup
        if (typeof (global as any).scheduleCleanup === 'function') {
          (global as any).scheduleCleanup();
        }
      });
    }

    return url;
  };
}

/**
 * Close the server and clean up
 */
function closeServer() {
  if (serverInstance) {
    console.log('[VideoServer] Shutting down...');
    serverInstance.server.close();
    TOKENS.clear();
    serverInstance = null;
  }
}

// Singleton getter for the video server
let serverPromise: ReturnType<typeof startVideoServer> | null = null;

export async function getVideoServer() {
  if (!serverPromise) {
    serverPromise = startVideoServer();
  }
  return serverPromise;
}

/**
 * Export closeServer for cleanup on app quit
 */
export { closeServer as closeVideoServer };
