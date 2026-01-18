import { app, type IpcMainInvokeEvent } from 'electron'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { isDev } from '../config'
import { isPathWithin } from './path-validation'

export function isTrustedRendererUrl(urlString: string): boolean {
  if (!urlString) return false

  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    // Some frames can be about:blank during initialization; keep this dev-only.
    return isDev && urlString === 'about:blank'
  }

  if (parsed.protocol === 'app:') {
    // Only trust app:// URLs from the local app origin
    // Valid patterns: app://./path, app:///path, or empty hostname
    // Reject: app://evil.com, app://attacker.com/steal-data
    const hostname = parsed.hostname
    if (!hostname || hostname === '.' || hostname === 'localhost') {
      return true
    }
    return false
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    if (!isDev) return false
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
  }

  if (parsed.protocol === 'file:') {
    // In local builds we may load the exported Next.js output directly from disk.
    // Only trust files within the app's `out/` directory.
    try {
      const requestedPath = path.resolve(fileURLToPath(parsed))
      const outDir = path.resolve(app.getAppPath(), 'out')
      return isPathWithin(requestedPath, outDir)
    } catch {
      return false
    }
  }

  return false
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent, channel: string): void {
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error(`[IPC] Blocked untrusted sender for ${channel}: ${senderUrl}`)
  }
}

export function getAllowedCorsOriginHeader(origin: string | null): string | null {
  if (!origin) return null
  // SECURITY: Never return 'null' as a CORS origin.
  // Browsers send Origin: null for sandboxed iframes, file:// pages, and data: URLs.
  // Returning Access-Control-Allow-Origin: null would allow these to read responses,
  // which is a CORS bypass vulnerability.
  if (origin === 'null') return null
  return isTrustedRendererUrl(origin) ? origin : null
}

