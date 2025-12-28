import { BrowserWindow, Session } from 'electron'
import { isDev } from '../config'

const DEV_CONNECT_SOURCES = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'ws://localhost:*',
  'ws://127.0.0.1:*'
]

export function getContentSecurityPolicy(): string {
  const connectSrc = [
    "'self'",
    'file:',
    'data:',
    'blob:',
    'video-stream:',
    ...(isDev ? DEV_CONNECT_SOURCES : [])
  ]

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file: video-stream:",
    "font-src 'self' data:",
    "media-src 'self' data: blob: file: video-stream:",
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'"
  ].join('; ')
}

const appliedSessions = new WeakSet<Session>()

export function applyContentSecurityPolicy(window: BrowserWindow): void {
  const session = window.webContents.session
  if (appliedSessions.has(session)) return

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': getContentSecurityPolicy()
      }
    })
  })

  appliedSessions.add(session)
}
