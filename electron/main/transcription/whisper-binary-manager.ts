import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const WHISPER_BINARY_NAME = 'whisper-cli'
const WHISPER_CPP_VERSION = 'v1.7.2'  // Stable version with whisper-cli
// SHA256 checksum for whisper.cpp v1.7.2 source tarball
// This should be updated when WHISPER_CPP_VERSION changes
const WHISPER_TARBALL_SHA256 = 'd6e413dad08e227e1c39cbf3b6c11f36a7ed11f5ac53a88af1bfb87adf61b478'

/**
 * Verify file checksum against expected SHA256 hash
 * @param filePath - Path to file to verify
 * @param expectedHash - Expected SHA256 hash (lowercase hex)
 * @returns true if checksum matches
 */
async function verifyChecksum(filePath: string, expectedHash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(filePath)

        stream.on('data', (data) => hash.update(data))
        stream.on('end', () => {
            const actualHash = hash.digest('hex')
            resolve(actualHash === expectedHash.toLowerCase())
        })
        stream.on('error', (err) => reject(err))
    })
}

export interface WhisperBinaryStatus {
    available: boolean
    path?: string
    platform: string
    arch: string
    canAutoInstall: boolean
}

function getBinaryDirectory(): string {
    // Store in userData for dev, resourcesPath for packaged
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', 'whisper', `${process.platform}-${process.arch}`)
    }
    return path.join(app.getPath('userData'), 'bin', 'whisper', `${process.platform}-${process.arch}`)
}

function getSearchPaths(): string[] {
    const platform = process.platform
    const arch = process.arch
    const folder = `${platform}-${arch}`

    const candidates: string[] = []
    if (app.isPackaged) {
        candidates.push(path.join(process.resourcesPath, 'bin', 'whisper', folder, WHISPER_BINARY_NAME))
    }
    // User data directory (for downloaded binaries)
    candidates.push(path.join(app.getPath('userData'), 'bin', 'whisper', folder, WHISPER_BINARY_NAME))
    // Project resources (for bundled binaries)
    candidates.push(path.join(app.getAppPath(), 'resources', 'bin', 'whisper', folder, WHISPER_BINARY_NAME))
    candidates.push(path.join(process.cwd(), 'resources', 'bin', 'whisper', folder, WHISPER_BINARY_NAME))

    return candidates
}

export function findWhisperBinary(): string | null {
    for (const candidate of getSearchPaths()) {
        if (fs.existsSync(candidate)) {
            return candidate
        }
    }
    return null
}

export function getWhisperBinaryStatus(): WhisperBinaryStatus {
    const binaryPath = findWhisperBinary()
    const platform = process.platform
    const arch = process.arch

    // Can auto-install on macOS via Homebrew or build from source
    const canAutoInstall = platform === 'darwin'

    return {
        available: binaryPath !== null,
        path: binaryPath ?? undefined,
        platform,
        arch,
        canAutoInstall
    }
}

async function downloadFile(
    url: string,
    destination: string,
    onProgress?: (progress: number) => void,
    maxRedirects: number = 5
): Promise<void> {
    return new Promise((resolve, reject) => {
        const doRequest = (requestUrl: string, redirectsLeft: number) => {
            https.get(requestUrl, response => {
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
                    const redirectUrl = location.startsWith('http') ? location : new URL(location, requestUrl).toString()
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

export async function installWhisperBinary(
    onProgress?: (stage: string, progress: number) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
    const platform = process.platform
    const arch = process.arch

    if (platform !== 'darwin') {
        return {
            success: false,
            error: `Automatic installation not supported on ${platform}. Please build whisper.cpp manually.`
        }
    }

    const binDir = getBinaryDirectory()
    const binaryPath = path.join(binDir, WHISPER_BINARY_NAME)

    try {
        // Create directory
        await fs.promises.mkdir(binDir, { recursive: true })

        // Try Homebrew first (fastest if available)
        onProgress?.('checking', 0.1)
        try {
            const { stdout: brewPath } = await execFileAsync('which', ['brew'])
            if (brewPath.trim()) {
                onProgress?.('installing', 0.2)

                // Check if whisper-cpp is already installed
                try {
                    await execFileAsync('brew', ['list', 'whisper-cpp'])
                } catch {
                    // Not installed, install it
                    await execFileAsync('brew', ['install', 'whisper-cpp'])
                }

                onProgress?.('copying', 0.8)

                // Find the installed binary - try whisper-cli first, then whisper
                let sourcePath = ''
                try {
                    const { stdout: whisperCliPath } = await execFileAsync('which', ['whisper-cli'])
                    sourcePath = whisperCliPath.trim()
                } catch {
                    try {
                        const { stdout: whisperPath } = await execFileAsync('which', ['whisper'])
                        sourcePath = whisperPath.trim()
                    } catch {
                        // Neither found
                    }
                }

                if (sourcePath && fs.existsSync(sourcePath)) {
                    await fs.promises.copyFile(sourcePath, binaryPath)
                    await fs.promises.chmod(binaryPath, 0o755)

                    // Also copy the required dylibs from libexec
                    try {
                        const { stdout: brewPrefix } = await execFileAsync('brew', ['--prefix', 'whisper-cpp'])
                        const libDir = path.join(brewPrefix.trim(), 'libexec', 'lib')
                        const targetLibDir = path.join(binDir, '..', 'lib')
                        await fs.promises.mkdir(targetLibDir, { recursive: true })

                        // Copy all dylibs (whisper + ggml)
                        const libFiles = await fs.promises.readdir(libDir)
                        for (const file of libFiles) {
                            if (file.endsWith('.dylib')) {
                                const src = path.join(libDir, file)
                                const dest = path.join(targetLibDir, file)
                                await fs.promises.copyFile(src, dest)
                            }
                        }

                        // Codesign all libraries for macOS security
                        for (const file of libFiles) {
                            if (file.endsWith('.dylib')) {
                                const dest = path.join(targetLibDir, file)
                                await execFileAsync('codesign', ['-s', '-', '--force', dest])
                            }
                        }

                        // Update the binary's rpath and codesign it
                        try {
                            await execFileAsync('install_name_tool', ['-add_rpath', '@executable_path/../lib', binaryPath])
                        } catch {
                            // rpath may already exist, ignore error
                        }
                        await execFileAsync('codesign', ['-s', '-', '--force', binaryPath])
                    } catch (libError) {
                        console.log('Could not copy libraries, binary may not work:', libError)
                    }

                    onProgress?.('complete', 1)
                    return { success: true, path: binaryPath }
                }
            }
        } catch {
            console.log('Homebrew not available, trying build from source...')
        }

        // Fallback: Build from source
        onProgress?.('downloading', 0.1)

        const tempDir = path.join(app.getPath('temp'), `whisper-build-${Date.now()}`)
        await fs.promises.mkdir(tempDir, { recursive: true })

        const tarballUrl = `https://github.com/ggerganov/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`
        const tarballPath = path.join(tempDir, 'whisper.tar.gz')

        await downloadFile(tarballUrl, tarballPath, (p) => onProgress?.('downloading', 0.1 + p * 0.25))

        // Verify checksum before extraction
        onProgress?.('verifying', 0.35)
        const checksumValid = await verifyChecksum(tarballPath, WHISPER_TARBALL_SHA256)
        if (!checksumValid) {
            await fs.promises.rm(tempDir, { recursive: true, force: true })
            throw new Error('Checksum verification failed for downloaded tarball')
        }

        onProgress?.('extracting', 0.4)
        await execFileAsync('tar', ['-xzf', 'whisper.tar.gz'], { cwd: tempDir })

        const extractedDir = path.join(tempDir, `whisper.cpp-${WHISPER_CPP_VERSION.replace('v', '')}`)

        onProgress?.('building', 0.5)

        // Build with Metal support for Apple Silicon
        // Get CPU count for parallel build
        const { stdout: cpuCountStr } = await execFileAsync('sysctl', ['-n', 'hw.ncpu'])
        const cpuCount = parseInt(cpuCountStr.trim(), 10) || 4
        const makeArgs = arch === 'arm64'
            ? ['whisper-cli', 'WHISPER_METAL=1', `-j${cpuCount}`]
            : ['whisper-cli', `-j${cpuCount}`]

        await execFileAsync('make', makeArgs, { cwd: extractedDir })

        onProgress?.('installing', 0.9)

        // Copy binary
        const builtBinary = path.join(extractedDir, 'whisper-cli')
        if (!fs.existsSync(builtBinary)) {
            throw new Error('Build completed but binary not found')
        }

        await fs.promises.copyFile(builtBinary, binaryPath)
        await fs.promises.chmod(binaryPath, 0o755)

        // Cleanup
        await fs.promises.rm(tempDir, { recursive: true, force: true })

        onProgress?.('complete', 1)
        return { success: true, path: binaryPath }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Installation failed'
        return { success: false, error: message }
    }
}
