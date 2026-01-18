import { ipcMain, nativeImage, app, IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { makeVideoSrc } from '../utils/video-url-factory'
import { assertTrustedIpcSender } from '../utils/ipc-security'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const ALPHA_THRESHOLD = 8
const TRIM_ALPHA_THRESHOLD = 32
const COLOR_TOLERANCE = 24
const MIN_REGION_RATIO = 0.05

type PreinstalledWallpaperEntry = {
  id: string
  name: string
  path: string
  absolutePath: string
}

let cachedPreinstalledWallpapers: {
  root: string
  rootMtimeMs: number
  result: PreinstalledWallpaperEntry[]
} | null = null

type ScreenRegion = {
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
}

type FrameBounds = {
  x: number
  y: number
  width: number
  height: number
}

function loadImageFromPath(imagePath: string): Electron.NativeImage | null {
  let image = nativeImage.createFromPath(imagePath)
  if (!image.isEmpty()) return image

  try {
    const buffer = fs.readFileSync(imagePath)
    image = nativeImage.createFromBuffer(buffer)
  } catch (error) {
    console.warn('[Assets] Failed to read mockup image:', imagePath, error)
  }

  if (image.isEmpty()) return null
  return image
}

function findOpaqueScreenRegion(bitmap: Buffer, width: number, height: number): ScreenRegion | null {
  const centerX = Math.floor(width / 2)
  const centerY = Math.floor(height / 2)
  const total = width * height

  const getIndex = (x: number, y: number) => (y * width + x) * 4
  const isOpaque = (idx: number) => bitmap[idx + 3] > ALPHA_THRESHOLD

  let seedX = centerX
  let seedY = centerY
  let seedIdx = getIndex(seedX, seedY)
  if (!isOpaque(seedIdx)) {
    let found = false
    const maxRadius = Math.max(width, height)
    for (let radius = 1; radius < maxRadius && !found; radius += 1) {
      for (let dx = -radius; dx <= radius && !found; dx += 1) {
        const dy = radius
        const candidates = [
          [centerX + dx, centerY + dy],
          [centerX + dx, centerY - dy],
        ]
        for (const [x, y] of candidates) {
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          const idx = getIndex(x, y)
          if (isOpaque(idx)) {
            seedX = x
            seedY = y
            seedIdx = idx
            found = true
            break
          }
        }
      }
      for (let dy = -radius + 1; dy <= radius - 1 && !found; dy += 1) {
        const dx = radius
        const candidates = [
          [centerX + dx, centerY + dy],
          [centerX - dx, centerY + dy],
        ]
        for (const [x, y] of candidates) {
          if (x < 0 || x >= width || y < 0 || y >= height) continue
          const idx = getIndex(x, y)
          if (isOpaque(idx)) {
            seedX = x
            seedY = y
            seedIdx = idx
            found = true
            break
          }
        }
      }
    }
    if (!found) return null
  }

  const seedR = bitmap[seedIdx]
  const seedG = bitmap[seedIdx + 1]
  const seedB = bitmap[seedIdx + 2]

  const matchesSeed = (idx: number) => {
    if (bitmap[idx + 3] <= ALPHA_THRESHOLD) return false
    const r = bitmap[idx]
    const g = bitmap[idx + 1]
    const b = bitmap[idx + 2]
    return (
      Math.abs(r - seedR) <= COLOR_TOLERANCE &&
      Math.abs(g - seedG) <= COLOR_TOLERANCE &&
      Math.abs(b - seedB) <= COLOR_TOLERANCE
    )
  }

  const findByAxisScan = (): ScreenRegion | null => {
    let left = seedX
    while (left > 0 && matchesSeed(getIndex(left - 1, seedY))) left -= 1
    let right = seedX
    while (right < width - 1 && matchesSeed(getIndex(right + 1, seedY))) right += 1
    let top = seedY
    while (top > 0 && matchesSeed(getIndex(seedX, top - 1))) top -= 1
    let bottom = seedY
    while (bottom < height - 1 && matchesSeed(getIndex(seedX, bottom + 1))) bottom += 1

    const screenWidth = right - left + 1
    const screenHeight = bottom - top + 1
    if (screenWidth <= 0 || screenHeight <= 0) return null
    if ((screenWidth * screenHeight) / total < MIN_REGION_RATIO) return null

    let cornerRadius = 0
    for (let x = left; x <= right; x += 1) {
      const idx = getIndex(x, top)
      if (matchesSeed(idx)) {
        cornerRadius = x - left
        break
      }
    }
    for (let y = top; y <= bottom; y += 1) {
      const idx = getIndex(left, y)
      if (matchesSeed(idx)) {
        const candidate = y - top
        if (cornerRadius === 0 || candidate < cornerRadius) {
          cornerRadius = candidate
        }
        break
      }
    }

    return { x: left, y: top, width: screenWidth, height: screenHeight, cornerRadius }
  }

  const findByFloodFill = (): ScreenRegion | null => {
    const visited = new Uint8Array(total)
    const queue: number[] = []
    let head = 0

    const startIdx = seedY * width + seedX
    visited[startIdx] = 1
    queue.push(startIdx)

    let minX = seedX
    let maxX = seedX
    let minY = seedY
    let maxY = seedY
    let count = 0

    while (head < queue.length) {
      const idx = queue[head]
      head += 1
      const x = idx % width
      const y = Math.floor(idx / width)
      const pixelIdx = idx * 4

      if (!matchesSeed(pixelIdx)) continue
      count += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const nIdx = ny * width + nx
        if (visited[nIdx]) continue
        visited[nIdx] = 1
        queue.push(nIdx)
      }
    }

    if (count === 0) return null
    if (count / total < MIN_REGION_RATIO) return null

    const screenWidth = maxX - minX + 1
    const screenHeight = maxY - minY + 1

    let cornerRadius = 0
    for (let x = minX; x <= maxX; x += 1) {
      const idx = (minY * width + x) * 4
      if (matchesSeed(idx)) {
        cornerRadius = x - minX
        break
      }
    }
    for (let y = minY; y <= maxY; y += 1) {
      const idx = (y * width + minX) * 4
      if (matchesSeed(idx)) {
        const candidate = y - minY
        if (cornerRadius === 0 || candidate < cornerRadius) {
          cornerRadius = candidate
        }
        break
      }
    }

    return {
      x: minX,
      y: minY,
      width: screenWidth,
      height: screenHeight,
      cornerRadius
    }
  }

  const axisRegion = findByAxisScan()
  const floodRegion = findByFloodFill()

  if (axisRegion && floodRegion) {
    const axisArea = axisRegion.width * axisRegion.height
    const floodArea = floodRegion.width * floodRegion.height
    const axisRatio = axisArea / total
    if (axisRatio >= MIN_REGION_RATIO * 2 && axisArea < floodArea * 0.9) {
      return axisRegion
    }
    return floodRegion
  }

  return axisRegion ?? floodRegion
}

function findOpaqueBounds(bitmap: Buffer, width: number, height: number): FrameBounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = bitmap[(y * width + x) * 4 + 3]
      if (alpha <= TRIM_ALPHA_THRESHOLD) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0 || maxY < 0) return null

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

function findTransparentScreenRegion(imagePath: string): { dimensions: { width: number; height: number }; screenRegion: ScreenRegion; frameBounds: FrameBounds } | null {
  const image = loadImageFromPath(imagePath)
  if (!image) return null

  const { width, height } = image.getSize()
  if (width === 0 || height === 0) return null

  const bitmap = image.toBitmap()
  const frameBounds = findOpaqueBounds(bitmap, width, height) ?? { x: 0, y: 0, width, height }
  const total = width * height
  const transparent = new Uint8Array(total)

  for (let i = 0; i < total; i += 1) {
    const alpha = bitmap[i * 4 + 3]
    if (alpha <= ALPHA_THRESHOLD) transparent[i] = 1
  }

  const background = new Uint8Array(total)
  const queue: number[] = []
  let head = 0

  const enqueue = (idx: number) => {
    background[idx] = 1
    queue.push(idx)
  }

  const bounds = frameBounds
  const boundRight = bounds.x + bounds.width - 1
  const boundBottom = bounds.y + bounds.height - 1

  const tryEnqueue = (x: number, y: number) => {
    if (x < bounds.x || x > boundRight || y < bounds.y || y > boundBottom) return
    const idx = y * width + x
    if (transparent[idx] && !background[idx]) {
      enqueue(idx)
    }
  }

  for (let x = bounds.x; x <= boundRight; x += 1) {
    tryEnqueue(x, bounds.y)
    tryEnqueue(x, boundBottom)
  }
  for (let y = bounds.y; y <= boundBottom; y += 1) {
    tryEnqueue(bounds.x, y)
    tryEnqueue(boundRight, y)
  }

  while (head < queue.length) {
    const idx = queue[head]
    head += 1
    const x = idx % width
    const y = Math.floor(idx / width)

    if (x > 0) tryEnqueue(x - 1, y)
    if (x < width - 1) tryEnqueue(x + 1, y)
    if (y > 0) tryEnqueue(x, y - 1)
    if (y < height - 1) tryEnqueue(x, y + 1)
  }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = bounds.y; y <= boundBottom; y += 1) {
    for (let x = bounds.x; x <= boundRight; x += 1) {
      const idx = y * width + x
      if (!transparent[idx] || background[idx]) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0 || maxY < 0) {
    const solidRegion = findOpaqueScreenRegion(bitmap, width, height)
    return {
      dimensions: { width, height },
      screenRegion: solidRegion ?? { x: 0, y: 0, width, height, cornerRadius: 0 },
      frameBounds
    }
  }

  const screenWidth = maxX - minX + 1
  const screenHeight = maxY - minY + 1

  let cornerRadius = 0
  for (let x = minX; x <= maxX; x += 1) {
    const idx = minY * width + x
    if (transparent[idx] && !background[idx]) {
      cornerRadius = x - minX
      break
    }
  }
  for (let y = minY; y <= maxY; y += 1) {
    const idx = y * width + minX
    if (transparent[idx] && !background[idx]) {
      const candidate = y - minY
      if (cornerRadius === 0 || candidate < cornerRadius) {
        cornerRadius = candidate
      }
      break
    }
  }

  return {
    dimensions: { width, height },
    screenRegion: {
      x: minX,
      y: minY,
      width: screenWidth,
      height: screenHeight,
      cornerRadius
    },
    frameBounds
  }
}

function getParallaxRootDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'public', 'parallax')
    : path.join(process.cwd(), 'public', 'parallax')
}

function getWallpapersRootDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'public', 'wallpapers')
    : path.join(process.cwd(), 'public', 'wallpapers')
}

function getMockupsRootDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'public', 'mockups')
    : path.join(process.cwd(), 'public', 'mockups')
}

function numericSortKey(filename: string): number {
  const match = filename.match(/(\d+)(?!.*\d)/)
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY
}

export function registerAssetHandlers(): void {
  ipcMain.handle('list-parallax-presets', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'list-parallax-presets')
    const root = getParallaxRootDir()

    try {
      if (!fs.existsSync(root)) return []

      const presetDirs = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort((a, b) => a.localeCompare(b))

      return presetDirs.map((folder) => {
        const presetPath = path.join(root, folder)
        const files = fs.readdirSync(presetPath, { withFileTypes: true })
          .filter(d => d.isFile())
          .map(d => d.name)
          .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
          .sort((a, b) => {
            const ak = numericSortKey(a)
            const bk = numericSortKey(b)
            if (ak !== bk) return bk - ak
            return a.localeCompare(b)
          })

        return { id: folder, name: folder, folder, files }
      }).filter(p => p.files.length > 0)
    } catch (error) {
      console.error('[Assets] Failed to list parallax presets:', error)
      return []
    }
  })

  // List pre-installed wallpapers from public/wallpapers
  ipcMain.handle('list-preinstalled-wallpapers', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'list-preinstalled-wallpapers')
    const root = getWallpapersRootDir()
    const logAssets = process.env.DEBUG_ASSETS === '1'
    if (logAssets) console.log('[Assets] Loading preinstalled wallpapers from:', root)

    try {
      if (!fs.existsSync(root)) {
        if (logAssets) console.log('[Assets] Wallpapers directory does not exist:', root)
        return []
      }

      // Cache aggressively: wallpapers are bundled and rarely change at runtime.
      // This avoids repeated disk scans during export and fast UI polling.
      const rootStats = fs.statSync(root)
      const rootMtimeMs = rootStats.mtimeMs
      if (
        cachedPreinstalledWallpapers &&
        cachedPreinstalledWallpapers.root === root &&
        cachedPreinstalledWallpapers.rootMtimeMs === rootMtimeMs
      ) {
        return cachedPreinstalledWallpapers.result
      }

      const files = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => d.isFile())
        .map(d => d.name)
        .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
        .sort((a, b) => {
          const ak = numericSortKey(a)
          const bk = numericSortKey(b)
          if (ak !== bk) return ak - bk
          return a.localeCompare(b)
        })

      const result = files.map((filename, index) => {
        // Normalize names
        let displayName = filename.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
        displayName = displayName
          .replace(/^OpenScreen\s*Wallpaper\s*/i, 'Wallpaper ')
          .replace(/^Wallpaper\s*\d*\s*from\s*OpenScreen$/i, `Wallpaper ${numericSortKey(filename)}`)
          .trim()

        if (!displayName) displayName = `Wallpaper ${index + 1}`

        const absolutePath = path.join(root, filename)

        return {
          id: filename,
          name: displayName,
          path: `/wallpapers/${filename}`,
          absolutePath
        }
      })
      if (logAssets) console.log('[Assets] Found', result.length, 'preinstalled wallpapers')
      cachedPreinstalledWallpapers = { root, rootMtimeMs, result }
      return result
    } catch (error) {
      console.error('[Assets] Failed to list preinstalled wallpapers:', error)
      return []
    }
  })

  // List available device mockups from public/mockups
  ipcMain.handle('list-available-mockups', async (event: IpcMainInvokeEvent) => {
    assertTrustedIpcSender(event, 'list-available-mockups')
    const root = getMockupsRootDir()
    console.log('[Assets] Scanning mockups from:', root)

    try {
      if (!fs.existsSync(root)) {
        console.log('[Assets] Mockups directory does not exist:', root)
        return { devices: [] }
      }

      const deviceTypes = fs.readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name)

      const devices: Array<{
        type: string
        models: Array<{
          id: string
          name: string
          folder: string
          variants: Array<{ name: string; filename: string; path: string }>
          frame?: {
            path: string
            width: number
            height: number
            screenRegion: ScreenRegion
            frameBounds?: FrameBounds
          }
        }>
      }> = []

      for (const deviceType of deviceTypes) {
        const typePath = path.join(root, deviceType)
        const modelDirs = fs.readdirSync(typePath, { withFileTypes: true })
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => d.name)
          .sort((a, b) => a.localeCompare(b))

        const models: typeof devices[0]['models'] = []

        for (const modelDir of modelDirs) {
          const modelPath = path.join(typePath, modelDir)

          // Look for "Device" subfolder first, then root of model folder
          const deviceFolderPath = path.join(modelPath, 'Device')
          const hasDeviceFolder = fs.existsSync(deviceFolderPath)
          const variantPath = hasDeviceFolder ? deviceFolderPath : modelPath

          const files = fs.readdirSync(variantPath, { withFileTypes: true })
            .filter(d => d.isFile())
            .map(d => d.name)
            .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b))

          if (files.length === 0) continue

          const defaultVariantPath = path.join(variantPath, files[0])
          const frameMetadata = findTransparentScreenRegion(defaultVariantPath)

          // Generate paths asynchronously using makeVideoSrc
          const variants = await Promise.all(files.map(async (filename) => {
            // Extract color variant from filename
            let colorName = filename.replace(/\.(png|jpg|jpeg|webp|svg)$/i, '')
            colorName = colorName.replace(new RegExp(`^${modelDir}\\s*[—-]?\\s*`, 'i'), '')
            colorName = colorName.replace(/^Apple\\s+/i, '')
            colorName = colorName.trim() || 'Default'

            const absolutePath = path.join(variantPath, filename)
            const videoUrl = await makeVideoSrc(absolutePath, 'preview')

            return {
              name: colorName,
              filename,
              path: videoUrl
            }
          }))

          const framePath = await makeVideoSrc(defaultVariantPath, 'preview')

          models.push({
            id: modelDir.toLowerCase().replace(/\s+/g, '-'),
            name: modelDir,
            folder: modelDir,
            variants,
            frame: frameMetadata ? {
              path: framePath,
              width: frameMetadata.dimensions.width,
              height: frameMetadata.dimensions.height,
              screenRegion: frameMetadata.screenRegion,
              frameBounds: frameMetadata.frameBounds
            } : undefined
          })
        }

        if (models.length > 0) {
          devices.push({ type: deviceType, models })
        }
      }

      console.log('[Assets] Found mockups:', devices.map(d => `${d.type}: ${d.models.length} models`).join(', '))
      return { devices }
    } catch (error) {
      console.error('[Assets] Failed to list mockups:', error)
      return { devices: [] }
    }
  })
}
