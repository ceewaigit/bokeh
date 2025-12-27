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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
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
