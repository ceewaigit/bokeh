import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getNextJsPort } from './utils/port-detector'

export const isDev = process.env.NODE_ENV === 'development'

export function getAppURL(route: string = ''): string {
  console.log('🔍 getAppURL called with route:', route)
  console.log('🔍 isDev:', isDev)
  console.log('🔍 MAIN_WINDOW_WEBPACK_ENTRY:', process.env.MAIN_WINDOW_WEBPACK_ENTRY)
  console.log('🔍 DEV_SERVER_URL:', process.env.DEV_SERVER_URL)
  console.log('🔍 npm_lifecycle_event:', process.env.npm_lifecycle_event)
  console.log('🔍 process.argv:', process.argv)

  // Try to detect if we're in webpack dev mode by checking for common webpack indicators
  const isWebpackDev = process.env.npm_lifecycle_event === 'forge:start' ||
    process.env.ELECTRON_IS_DEV === 'true' ||
    process.argv.some(arg => arg.includes('forge') || arg.includes('webpack')) ||
    __dirname.includes('.webpack')

  console.log('🔍 isWebpackDev:', isWebpackDev)
  console.log('🔍 __dirname:', __dirname)

  if (isWebpackDev) {
    // When running with forge:start, use the webpack dev server
    // The webpack renderer runs on port 3001 with the main_window endpoint
    const webpackPort = 3001 // Webpack dev server port from forge.config.js
    const webpackDevUrl = `http://localhost:${webpackPort}/main_window`
    console.log('🔍 Using webpack dev server on port:', webpackPort, 'URL:', webpackDevUrl)

    if (route) {
      return `${webpackDevUrl}#${route}`
    }
    return webpackDevUrl
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
  if (process.env.MAIN_WINDOW_WEBPACK_ENTRY) {
    const baseUrl = process.env.MAIN_WINDOW_WEBPACK_ENTRY
    console.log('🔍 Using webpack entry URL:', baseUrl)

    // For routes, we need to navigate within the single-page app
    if (route) {
      // Return the main entry with a hash route for client-side routing
      return `${baseUrl}#${route}`
    }

    return baseUrl
  }

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
