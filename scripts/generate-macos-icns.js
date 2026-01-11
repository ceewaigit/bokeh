#!/usr/bin/env node
/**
 * Generates a minimal macOS .icns file (ic10) from a 1024x1024 PNG.
 *
 * This avoids relying on `iconutil` which can be unreliable in some environments.
 */
const fs = require('node:fs')
const path = require('node:path')

function usage() {
  console.error('Usage: node scripts/generate-macos-icns.js <input.png> <output.icns>')
  process.exit(1)
}

const input = process.argv[2]
const output = process.argv[3]
if (!input || !output) usage()

const inputPath = path.resolve(process.cwd(), input)
const outputPath = path.resolve(process.cwd(), output)

if (!fs.existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`)
  process.exit(1)
}

const png = fs.readFileSync(inputPath)

// ICNS container header (8 bytes) + one PNG chunk (8 bytes header + data)
const chunkType = 'ic10' // 1024×1024 PNG
const chunkLength = 8 + png.length
const totalLength = 8 + chunkLength

const icns = Buffer.alloc(totalLength)
icns.write('icns', 0, 4, 'ascii')
icns.writeUInt32BE(totalLength, 4)
icns.write(chunkType, 8, 4, 'ascii')
icns.writeUInt32BE(chunkLength, 12)
png.copy(icns, 16)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, icns)

console.log(`Wrote ${outputPath} (${icns.length} bytes)`)

