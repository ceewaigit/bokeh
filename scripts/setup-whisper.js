#!/usr/bin/env node

/**
 * Download whisper.cpp binary and base model for bundling
 * Run this before building the app: npm run setup:whisper
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync, spawn } = require('child_process')

const WHISPER_CPP_VERSION = 'v1.7.2'
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'

const RESOURCES_DIR = path.join(__dirname, '..', 'resources')
const BIN_DIR = path.join(RESOURCES_DIR, 'bin', 'whisper')
const MODELS_DIR = path.join(RESOURCES_DIR, 'models', 'whisper')

function getPlatformArch() {
    const platform = process.platform
    const arch = process.arch
    return `${platform}-${arch}`
}

function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const doRequest = (requestUrl, redirectsLeft = 5) => {
            https.get(requestUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    if (redirectsLeft <= 0) {
                        reject(new Error('Too many redirects'))
                        return
                    }
                    const redirectUrl = response.headers.location.startsWith('http')
                        ? response.headers.location
                        : new URL(response.headers.location, requestUrl).toString()
                    doRequest(redirectUrl, redirectsLeft - 1)
                    return
                }

                if (response.statusCode >= 400) {
                    reject(new Error(`Download failed: ${response.statusCode}`))
                    return
                }

                const file = fs.createWriteStream(dest)
                const total = parseInt(response.headers['content-length'] || '0', 10)
                let received = 0

                response.on('data', (chunk) => {
                    received += chunk.length
                    if (total && onProgress) {
                        onProgress(received, total)
                    }
                })

                response.pipe(file)
                file.on('finish', () => {
                    file.close()
                    resolve()
                })
                file.on('error', (err) => {
                    fs.unlink(dest, () => reject(err))
                })
            }).on('error', (err) => {
                fs.unlink(dest, () => reject(err))
            })
        }

        doRequest(url)
    })
}

async function buildWhisperBinary(platformArch) {
    const binDir = path.join(BIN_DIR, platformArch)
    const binaryPath = path.join(binDir, 'whisper-cli')

    if (fs.existsSync(binaryPath)) {
        console.log('✓ Whisper binary already exists')
        return
    }

    console.log('Building whisper.cpp from source...')

    const tempDir = path.join(require('os').tmpdir(), `whisper-build-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    // Download source
    console.log('  Downloading source...')
    const tarballPath = path.join(tempDir, 'whisper.tar.gz')
    await downloadFile(
        `https://github.com/ggerganov/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
        tarballPath,
        (received, total) => {
            process.stdout.write(`\r  Downloading: ${Math.round(received / total * 100)}%`)
        }
    )
    console.log('')

    // Extract
    console.log('  Extracting...')
    execSync(`tar -xzf whisper.tar.gz`, { cwd: tempDir })

    const extractedDir = path.join(tempDir, `whisper.cpp-${WHISPER_CPP_VERSION.replace('v', '')}`)

    // Build
    console.log('  Building (this may take a few minutes)...')
    const arch = process.arch
    const buildCmd = arch === 'arm64'
        ? 'make main GGML_METAL=1 -j$(sysctl -n hw.ncpu)'
        : 'make main -j$(sysctl -n hw.ncpu)'

    execSync(buildCmd, { cwd: extractedDir, stdio: 'inherit' })

    // Copy binary
    fs.mkdirSync(binDir, { recursive: true })
    fs.copyFileSync(path.join(extractedDir, 'main'), binaryPath)
    fs.chmodSync(binaryPath, 0o755)

    // Codesign
    try {
        execSync(`codesign -s - --force "${binaryPath}"`, { stdio: 'pipe' })
    } catch (e) {
        console.log('  Warning: Could not codesign binary')
    }

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true })

    console.log('✓ Whisper binary built successfully')
}

async function downloadModel() {
    const modelPath = path.join(MODELS_DIR, 'ggml-base.bin')

    if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath)
        if (stats.size > 100 * 1024 * 1024) { // > 100MB = valid
            console.log('✓ Base model already exists')
            return
        }
        // Corrupted/partial download, remove it
        fs.unlinkSync(modelPath)
    }

    console.log('Downloading base model (ggml-base.bin, ~141MB)...')
    fs.mkdirSync(MODELS_DIR, { recursive: true })

    await downloadFile(MODEL_URL, modelPath, (received, total) => {
        const percent = Math.round(received / total * 100)
        const mb = (received / 1024 / 1024).toFixed(1)
        process.stdout.write(`\r  Progress: ${percent}% (${mb} MB)`)
    })
    console.log('')
    console.log('✓ Base model downloaded successfully')
}

async function main() {
    console.log('=== Whisper Setup ===\n')

    const platformArch = getPlatformArch()
    console.log(`Platform: ${platformArch}\n`)

    if (process.platform !== 'darwin') {
        console.log('Note: Automatic binary building only works on macOS.')
        console.log('For other platforms, please build whisper.cpp manually and place it at:')
        console.log(`  ${path.join(BIN_DIR, platformArch, 'whisper-cli')}\n`)
    }

    try {
        await buildWhisperBinary(platformArch)
        await downloadModel()
        console.log('\n✓ Whisper setup complete!')
    } catch (error) {
        console.error('\n✗ Setup failed:', error.message)
        process.exit(1)
    }
}

main()
