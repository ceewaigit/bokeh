import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getNextJsPort } from './utils/port-detector'

export const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.ELECTRON_IS_DEV === 'true' ||
  process.defaultApp === true ||
  !app.isPackaged

function getForgeWebpackDevUrl(): string | null {
  // When running `electron-forge start` with the webpack plugin, the main process
  // is bundled into `.webpack/main`. If `MAIN_WINDOW_WEBPACK_ENTRY` isn't injected
  // (custom webpack config edge cases), fall back to a computed dev-server URL.
  const looksLikeForgeWebpack =
    process.env.npm_lifecycle_event === 'forge:start' ||
    __dirname.includes(`${path.sep}.webpack${path.sep}`) ||
    process.argv.some(arg => arg.includes('electron-forge'))

  if (!looksLikeForgeWebpack) return null

  const port =
    Number.parseInt(process.env.FORGE_WEBPACK_PORT || '', 10) ||
    Number.parseInt(process.env.WEBPACK_DEV_SERVER_PORT || '', 10) ||
    3001

  const host = process.env.WEBPACK_DEV_SERVER_HOST || '127.0.0.1'
  return `http://${host}:${port}/main_window`
}

export function getAppURL(route: string = ''): string {
  // Prefer the URL Electron Forge provides (dev + prod). This avoids hardcoding ports.
  if (process.env.MAIN_WINDOW_WEBPACK_ENTRY) {
    const baseUrl = process.env.MAIN_WINDOW_WEBPACK_ENTRY
    if (route) return `${baseUrl}#${route}`
    return baseUrl
  }

  const forgeWebpackDevUrl = getForgeWebpackDevUrl()
  if (forgeWebpackDevUrl) {
    if (route) return `${forgeWebpackDevUrl}#${route}`
    return forgeWebpackDevUrl
  }

  if (isDev && !process.env.MAIN_WINDOW_WEBPACK_ENTRY) {
    // Development mode with Next.js dev server
    const port = getNextJsPort()
    const devServerUrl = process.env.DEV_SERVER_URL || `http://localhost:${port}`
    // Use hash routing for client-side navigation
    if (route) {
      return `${devServerUrl}#${route}`
    }
    return devServerUrl
  }

  // For webpack builds (both dev and production)
  // Fallback for packaged app without webpack
  const isPackaged = app.isPackaged

  if (isPackaged) {
    // In packaged app, serve from the bundled out directory
    const htmlFile = 'index.html'
    const appUrl = `app://${htmlFile}`

    if (route) {
      return `${appUrl}#${route}`
    }

    console.log(`📦 Loading packaged app URL: ${appUrl}`)
    return appUrl
  } else {
    // Local build without webpack
    const htmlPath = path.join(__dirname, '../../out/index.html')
    // Properly encode the file path to handle spaces and special characters
    const fileUrl = `file://${encodeURI(htmlPath.replace(/\\/g, '/'))}`

    if (route) {
      return `${fileUrl}#${route}`
    }

    console.log(`📁 Loading local production HTML: ${htmlPath}`)
    console.log(`📁 File exists: ${fs.existsSync(htmlPath)}`)

    return fileUrl
  }
}

export function getRecordingsDirectory(): string {
  const recordingsDir = path.join(app.getPath('documents'), 'Bokeh Captures')
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true })
  }
  return recordingsDir
}
