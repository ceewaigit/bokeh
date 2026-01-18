import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'

export interface WhisperModel {
  name: string
  filePath: string
  sizeBytes: number
}

const MODEL_DIR_NAME = 'models/whisper'
const DEFAULT_MODELS = ['base', 'small', 'medium']
const ALLOWED_MODEL_DOWNLOAD_HOSTS = ['huggingface.co', 'hf.co', '.huggingface.co']

function assertAllowedModelDownloadUrl(urlString: string): string {
  const url = new URL(urlString)
  if (url.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS model download URL: ${urlString}`)
  }
  const host = url.hostname.toLowerCase()
  const allowed = ALLOWED_MODEL_DOWNLOAD_HOSTS.some(allowedHost =>
    allowedHost.startsWith('.') ? host.endsWith(allowedHost) : host === allowedHost
  )
  if (!allowed) {
    throw new Error(`Blocked model download host: ${host}`)
  }
  return url.toString()
}

function getSearchPaths(): string[] {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, MODEL_DIR_NAME))
  }
  candidates.push(path.join(app.getPath('userData'), MODEL_DIR_NAME))
  candidates.push(path.join(app.getAppPath(), 'resources', MODEL_DIR_NAME))
  return candidates
}

export function getModelDirectory(): string {
  return path.join(app.getPath('userData'), MODEL_DIR_NAME)
}

export function listModels(): WhisperModel[] {
  const models: WhisperModel[] = []
  for (const dir of getSearchPaths()) {
    if (!fs.existsSync(dir)) continue
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.bin')) continue
      const fullPath = path.join(dir, entry)
      try {
        const stat = fs.statSync(fullPath)
        // Filter out small/corrupted files (min 50MB for whisper models)
        if (stat.size < 50 * 1024 * 1024) continue

        const name = entry.replace(/^ggml-/, '').replace(/\.bin$/, '')
        models.push({ name, filePath: fullPath, sizeBytes: stat.size })
      } catch {
        // Ignore errors accessing file
      }
    }
  }
  return models
}

export function resolveModelPath(name: string): string {
  const filename = `ggml-${name}.bin`
  for (const dir of getSearchPaths()) {
    const candidate = path.join(dir, filename)
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate)
        if (stat.size > 50 * 1024 * 1024) {
          return candidate
        }
      } catch {
        // Ignore
      }
    }
  }
  throw new Error(`Model "${name}" not found or corrupted`)
}

export function recommendModel(): string {
  return 'base'
}

function downloadFile(
  url: string,
  destination: string,
  onProgress?: (progress: number) => void,
  maxRedirects: number = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl: string, redirectsLeft: number) => {
      let safeUrl: string
      try {
        safeUrl = assertAllowedModelDownloadUrl(requestUrl)
      } catch (e) {
        reject(e)
        return
      }

      https.get(safeUrl, response => {
        // Handle redirects (301, 302, 303, 307, 308)
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          const location = response.headers.location
          if (!location) {
            reject(new Error(`Redirect ${response.statusCode} without location header`))
            return
          }
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'))
            return
          }
          // Resolve relative URLs
          const redirectUrl = location.startsWith('http') ? location : new URL(location, safeUrl).toString()
          try {
            assertAllowedModelDownloadUrl(redirectUrl)
          } catch (e) {
            reject(e)
            return
          }
          doRequest(redirectUrl, redirectsLeft - 1)
          return
        }

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Download failed: ${response.statusCode}`))
          return
        }

        const file = fs.createWriteStream(destination)
        const total = Number(response.headers['content-length'] || 0)
        let received = 0
        response.on('data', chunk => {
          received += chunk.length
          if (total && onProgress) {
            onProgress(received / total)
          }
        })
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', err => {
          fs.unlink(destination, () => reject(err))
        })
      }).on('error', err => {
        fs.unlink(destination, () => reject(err))
      })
    }

    doRequest(url, maxRedirects)
  })
}

export async function downloadModel(
  name: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const dir = getModelDirectory()
  await fs.promises.mkdir(dir, { recursive: true })
  const filename = `ggml-${name}.bin`
  const destination = path.join(dir, filename)

  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${filename}`
  await downloadFile(url, destination, onProgress)
  return destination
}

export function getAvailableModelNames(): string[] {
  const available = new Set(listModels().map(model => model.name))
  DEFAULT_MODELS.forEach(name => available.add(name))
  return Array.from(available)
}
