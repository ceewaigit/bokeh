/**
 * Remotion bundle cache management
 * Handles creation and caching of webpack bundles for export
 */

import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import type { BundleCache } from './types'

let cachedBundle: BundleCache | null = null
let isBundling = false

const RENDER_BUNDLE_WATCH_DIRS = [
  path.join(process.cwd(), 'src', 'features', 'rendering'),
  path.join(process.cwd(), 'src', 'types'),
]

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json'])

function getLatestSourceMtimeMs(rootDirs: string[]): number {
  let latest = 0

  for (const root of rootDirs) {
    if (!fsSync.existsSync(root)) continue
    const stack: string[] = [root]

    while (stack.length) {
      const current = stack.pop()!
      let stat: fsSync.Stats
      try {
        stat = fsSync.statSync(current)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        let entries: string[]
        try {
          entries = fsSync.readdirSync(current)
        } catch {
          continue
        }
        for (const entry of entries) {
          // Skip common heavy dirs
          if (entry === 'node_modules' || entry === '.next' || entry === 'dist' || entry === 'out') continue
          stack.push(path.join(current, entry))
        }
        continue
      }

      if (!stat.isFile()) continue
      const ext = path.extname(current)
      if (!SOURCE_EXTENSIONS.has(ext)) continue
      latest = Math.max(latest, stat.mtimeMs)
    }
  }

  return latest
}

/**
 * Get or create webpack bundle with caching
 * @param forceRebuild - Force rebuild even if cached bundle exists
 * @returns Path to the bundle location
 */
export async function getBundleLocation(forceRebuild = false): Promise<string> {
  // If already bundling, wait for it to complete
  if (isBundling) {
    console.log('Bundle already in progress, waiting...')
    while (isBundling) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (cachedBundle?.location && fsSync.existsSync(cachedBundle.location)) {
      return cachedBundle.location
    }
  }

  // Check if we have a valid cached bundle
  if (!forceRebuild && cachedBundle?.location) {
    if (fsSync.existsSync(cachedBundle.location)) {
      const latestSourceMtimeMs = getLatestSourceMtimeMs(RENDER_BUNDLE_WATCH_DIRS)
      if (latestSourceMtimeMs > (cachedBundle.timestamp ?? 0)) {
        console.log('Cached Remotion bundle is stale (source changed), rebuilding...')
        cachedBundle = null
      } else {
      console.log('Using cached Remotion bundle from:', cachedBundle.location)
      return cachedBundle.location
      }
    } else {
      console.log('Cached bundle no longer exists, rebuilding...')
      cachedBundle = null
    }
  }

  try {
    isBundling = true
    console.log('Building new Remotion bundle...')

    const { bundle } = await import('@remotion/bundler')
    const entryPoint = path.join(process.cwd(), 'src/features/rendering/renderer/index.ts')

    const startTime = Date.now()
    const bundleLocation = await bundle({
      entryPoint,
      publicDir: path.join(process.cwd(), 'public'),
      webpackOverride: (config) => {
        const resolvedPath = path.resolve(process.cwd(), 'src')
        return {
          ...config,
          resolve: {
            ...config.resolve,
            alias: {
              ...config.resolve?.alias,
              '@': resolvedPath,
              '@/types': path.join(resolvedPath, 'types'),
              '@/lib': path.join(resolvedPath, 'lib'),
              '@/features': path.join(resolvedPath, 'features'),
            },
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          },
        }
      },
    })

    const bundleTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`Bundle created in ${bundleTime}s at:`, bundleLocation)

    // Cache the bundle
    cachedBundle = {
      location: bundleLocation,
      timestamp: Date.now()
    }

    return bundleLocation
  } finally {
    isBundling = false
  }
}

/**
 * Clean up cached bundle on app quit
 */
export function cleanupBundleCache(): void {
  if (cachedBundle?.location) {
    fs.rm(cachedBundle.location, { recursive: true, force: true }).catch(() => { })
    cachedBundle = null
  }
}

/**
 * Check if a bundle is currently cached
 */
export function hasCachedBundle(): boolean {
  return cachedBundle !== null && fsSync.existsSync(cachedBundle.location)
}

/**
 * Get the cached bundle location without rebuilding
 */
export function getCachedBundleLocation(): string | null {
  if (cachedBundle?.location && fsSync.existsSync(cachedBundle.location)) {
    return cachedBundle.location
  }
  return null
}
