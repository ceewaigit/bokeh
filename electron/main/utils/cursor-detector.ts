/**
 * Shared cursor detector module for handling native cursor detection
 * Used by mouse-tracking.ts
 */

// Declare shim for webpack's non-webpack require if present
declare const __non_webpack_require__: NodeJS.Require | undefined

let cursorDetector: any = null
let isInitialized = false

/**
 * Initialize the cursor detector module (macOS only)
 * @param purpose - Description of what the cursor detector will be used for (for logging)
 * @returns The cursor detector instance or null if unavailable
 */
export function initializeCursorDetector(purpose: string = 'cursor detection'): any {
  if (isInitialized) {
    return cursorDetector
  }

  if (process.platform !== 'darwin') {
    console.log(`Platform is not macOS, cursor detector not available for ${purpose}`)
    return null
  }

  console.log(`Platform is macOS, attempting to load cursor detector for ${purpose}...`)

  try {
    const { app } = require('electron')
    const path = require('path')
    const fs = require('fs')
    
    // Try multiple possible paths for the cursor detector module
    const possiblePaths = [
      // In development, the module is relative to the src directory
      path.join(app.getAppPath(), 'build', 'Release', 'cursor_detector.node'),
      // Try two levels up (useful when app.getAppPath() is .webpack/main)
      path.join(app.getAppPath(), '..', '..', 'build', 'Release', 'cursor_detector.node'),
      // In production, it might be in the resources directory
      path.join(process.resourcesPath || '', 'build', 'Release', 'cursor_detector.node'),
      // Fallback to old path resolution
      path.join(__dirname, '../../../build/Release/cursor_detector.node'),
      // Another possible location in packaged app
      path.join(app.getAppPath(), '..', 'build', 'Release', 'cursor_detector.node'),
      // Try absolute path as last resort
      path.join(process.cwd(), 'build', 'Release', 'cursor_detector.node')
    ]
    
    // Use Node's real require to bypass webpack bundling for native modules
    const nodeRequire: NodeJS.Require = (typeof __non_webpack_require__ !== 'undefined'
      ? __non_webpack_require__ as NodeJS.Require
      : (eval('require')))
    
    let moduleLoaded = false
    for (const modulePath of possiblePaths) {
      try {
        // Check if file exists before trying to require it
        if (fs.existsSync(modulePath)) {
          cursorDetector = nodeRequire(modulePath)
          console.log(`✅ Native cursor detector loaded successfully for ${purpose} from: ${modulePath}`)
          moduleLoaded = true
          isInitialized = true
          break
        }
      } catch (err: any) {
        // Continue to next path
        console.log(`Failed to load cursor detector from ${modulePath}:`, err?.message)
      }
    }
    
    if (!moduleLoaded) {
      console.log(`⚠️ Cursor detector module not found for ${purpose}, falling back to basic cursor tracking`)
      return null
    }

    // Check if we have permissions on load
    checkAccessibilityPermissions(purpose)
    
    return cursorDetector
  } catch (error) {
    console.error(`Failed to load cursor detector for ${purpose}:`, error)
    return null
  }
}

/**
 * Check if we have accessibility permissions
 * @param purpose - Description of what permissions are needed for (for logging)
 * @returns true if permissions are granted, false otherwise
 */
export function checkAccessibilityPermissions(purpose: string = 'cursor detection'): boolean {
  if (!cursorDetector || !cursorDetector.hasAccessibilityPermissions) {
    return false
  }

  try {
    const hasPermissions = cursorDetector.hasAccessibilityPermissions()
    console.log(`Accessibility permissions for ${purpose}: ${hasPermissions ? '✅ Granted' : '❌ Not granted'}`)
    return hasPermissions
  } catch (error) {
    console.error(`Failed to check accessibility permissions for ${purpose}:`, error)
    return false
  }
}

