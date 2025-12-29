import { app, protocol } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { Readable } from 'stream'
import { isDev } from '../config'
import { normalizeCrossPlatform } from '../utils/path-normalizer'
import { resolveRecordingFilePath, guessMimeType } from '../utils/file-resolution'

export function registerProtocol(): void {
  // Register app protocol for packaged app
  if (!isDev && app.isPackaged) {
    protocol.handle('app', async (request) => {
      const url = request.url.replace('app://', '')
      const decodedUrl = decodeURIComponent(url)
      try {
        const filePath = path.join(app.getAppPath(), 'out', decodedUrl)
        const stat = fs.statSync(filePath)
        const stream = fs.createReadStream(filePath)
        const body = Readable.toWeb(stream as any)

        return new Response(body as any, {
          status: 200,
          headers: {
            'Content-Length': String(stat.size),
            'Content-Type': 'text/html' // Adjust based on file type if needed
          }
        })
      } catch (error) {
        console.error('[Protocol] Error loading file:', error)
        return new Response('Not found', { status: 404 })
      }
    })
  }

  // Register video-stream protocol with HTTP Range support
  protocol.handle('video-stream', async (request) => {
    try {
      // Parse URL - handle ALL possible formats
      const url = new URL(request.url)
      let filePath: string = ''

      // Handle static assets (cursors, images, etc.)
      if (url.host === 'assets') {
        const assetPath = decodeURIComponent(url.pathname.slice(1)) // Remove leading slash and decode
        const publicPath = isDev
          ? path.join(app.getAppPath(), 'public', assetPath)
          : path.join(process.resourcesPath, 'public', assetPath)

        if (!fs.existsSync(publicPath)) {
          console.error('[Protocol] Asset not found:', publicPath)
          return new Response('Asset not found', { status: 404 })
        }

        // Serve the asset file
        const buffer = fs.readFileSync(publicPath)
        const mimeType = assetPath.endsWith('.png') ? 'image/png' :
          assetPath.endsWith('.jpg') ? 'image/jpeg' :
            assetPath.endsWith('.svg') ? 'image/svg+xml' :
              'application/octet-stream'

        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=3600'
          }
        })
      }

      // Format 1: video-stream://local/<encoded-path>
      if (url.host === 'local' || url.host === 'localhost') {
        const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
        try {
          filePath = decodeURIComponent(encodedPath)
        } catch {
          filePath = encodedPath // Use as-is if decode fails
        }
      }
      // Format 2: video-stream://Users/... or video-stream://users/... (malformed)
      else if (url.host) {
        // Try to reconstruct the path
        const hostPart = url.host
        const pathPart = url.pathname

        // Handle Windows paths (e.g., host="c", pathname="/Users/...")
        if (hostPart.length === 1 && /[a-zA-Z]/.test(hostPart)) {
          filePath = `${hostPart.toUpperCase()}:${pathPart}`
        }
        // Handle Unix paths (e.g., host="users", pathname="/name/...")
        else {
          // Capitalize first letter for common directories
          const capitalizedHost = ['users', 'home', 'var', 'tmp', 'opt'].includes(hostPart.toLowerCase())
            ? hostPart.charAt(0).toUpperCase() + hostPart.slice(1).toLowerCase()
            : hostPart
          filePath = `/${capitalizedHost}${pathPart}`
        }

        try {
          filePath = decodeURIComponent(filePath)
        } catch {
          // Use as-is if decode fails
        }
      }
      // Format 3: video-stream:///path/to/file (triple slash)
      else if (url.pathname) {
        try {
          filePath = decodeURIComponent(url.pathname)
        } catch {
          filePath = url.pathname
        }
      }

      // Format 4: Extract from full URL string if above failed
      if (!filePath || filePath === '/') {
        // Try to extract path from the original URL
        const match = request.url.match(/video-stream:\/\/(.+)$/)
        if (match) {
          filePath = match[1]
          // Remove 'local/' prefix if present
          if (filePath.startsWith('local/')) {
            filePath = filePath.slice(6)
          }
          try {
            filePath = decodeURIComponent(filePath)
          } catch {
            // Use as-is
          }
        }
      }

      // Use cross-platform normalizer
      filePath = normalizeCrossPlatform(filePath)

      const resolved = resolveRecordingFilePath(filePath)
      if (!resolved) {
        console.error('[Protocol] File not found:', filePath)
        return new Response('Not found', { status: 404 })
      }
      filePath = resolved

      const stat = fs.statSync(filePath)
      const total = stat.size
      const mimeType = guessMimeType(filePath)
      const lastModified = stat.mtime.toUTCString()
      const etag = `W/"${total}-${Math.floor(stat.mtimeMs)}"`

      // Handle HEAD requests
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(total),
            'Content-Type': mimeType,
            'Last-Modified': lastModified,
            'ETag': etag,
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      const rangeHeader = request.headers.get('range')

      if (rangeHeader) {
        // Parse Range header: bytes=<start>-<end>
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
        let start = match?.[1] ? parseInt(match[1], 10) : 0
        let end = match?.[2] ? parseInt(match[2], 10) : total - 1

        // Validate range
        if (Number.isNaN(start) || start < 0) start = 0
        if (Number.isNaN(end) || end >= total) end = total - 1

        if (start >= total || end < start) {
          return new Response(null, {
            status: 416, // Range Not Satisfiable
            headers: {
              'Content-Range': `bytes */${total}`,
              'Accept-Ranges': 'bytes'
            }
          })
        }

        const chunkSize = end - start + 1
        const nodeStream = fs.createReadStream(filePath, {
          start,
          end,
          highWaterMark: 256 * 1024 // 256KB chunks
        })

        // Convert Node stream to Web ReadableStream
        const body = Readable.toWeb(nodeStream as any)

        return new Response(body as any, {
          status: 206, // Partial Content
          headers: {
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': mimeType,
            'Last-Modified': lastModified,
            'ETag': etag,
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      // No Range header - stream entire file
      const nodeStream = fs.createReadStream(filePath, {
        highWaterMark: 256 * 1024
      })
      const body = Readable.toWeb(nodeStream as any)

      return new Response(body as any, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
          'Content-Type': mimeType,
          'Last-Modified': lastModified,
          'ETag': etag,
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (error) {
      console.error('[Protocol] video-stream handler error:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  })
}
