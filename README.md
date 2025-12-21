# Bokeh

A professional screen recording and editing application for macOS, focused on smooth animations, a powerful timeline, and fast exports.

![Bokeh](https://via.placeholder.com/800x400/7c3aed/ffffff?text=Bokeh)

## 🚀 Highlights

- Pixel-perfect screen recording up to 4K/60fps
- Smart area selection: full screen, window, or region
- Multi-audio: mic + system audio
- Professional timeline editor with keyframes
- Smooth zoom, cursor highlights, and click effects
- Fast exports with sensible presets

## 🧰 Tech Stack

- Next.js 14 + React + TypeScript
- Electron (main/preload) for native integration
- Tailwind + shadcn/ui
- FFmpeg for export pipeline

## 🖥 Platform support

- macOS 12.3+ (Monterey or newer)
  - Uses ScreenCaptureKit for native screen capture with hidden cursor
  - Older macOS versions will fall back to a web-based recorder (cursor visible)
- Apple Silicon and Intel
  - Development: build per-arch
  - Distribution: ship separate arm64/x64 builds or a universal binary

## ⚙️ Prerequisites

- Xcode Command Line Tools (for native modules)
- Node.js 20+ and npm

## 🏃 Getting started (development)

```bash
# 1) Install
npm install

# 2) Rebuild native modules for your Electron version
npm run rebuild

# 3) Run the app (Next.js + Electron)
npm run electron-dev
```

If you have a locally built native recorder module, you can force Electron to use it:
```bash
SCREENCAPTURE_KIT_PATH="$(pwd)/build/Release/screencapture_kit.node" npm run electron
```

## 📦 Building

```bash
# Build Next.js and Electron bundles
npm run build-electron

# Package via Electron Forge
npm run forge:package
```

For distribution on macOS, enable hardened runtime, codesign the app and native modules, and notarize the final artifact.

## 🔒 Permissions

- Screen Recording (required for capture)
- Microphone (if recording voice)
- Accessibility (for native cursor detection)

The app will prompt you and guide you to System Settings.

## 🧪 Scripts

```bash
npm run dev             # Next.js dev server only
npm run electron        # Build main/preload and run Electron
npm run electron-dev    # Next.js dev + Electron
npm run build           # Next.js production build
npm run build:electron  # Compile Electron TypeScript
npm run rebuild         # Rebuild native modules for Electron
```

## 📁 Project structure

```
src/
  app/                    # Next.js app router
  components/             # UI & editor components
  lib/                    # Core logic & rendering
  hooks/                  # Custom React hooks
  types/                  # TypeScript types

electron/
  main/                   # Electron main process
  preload.ts              # Preload bridge
  native/                 # Native modules (ScreenCaptureKit, cursor)
```

## 📝 License

MIT