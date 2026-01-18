# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Bokeh is a professional screen recording and editing application for macOS built with Electron + Next.js + React + TypeScript. It uses Remotion for video composition/rendering and FFmpeg for export.

## Commands

```bash
# Development
npm run electron-dev     # Run Next.js dev + Electron together

# Building
npm run build            # Build Next.js for production
npm run build:electron   # Compile Electron TypeScript only
npm run build-electron   # Full production build (Next.js + Electron + electron-builder)
npm run forge:make       # Create distributable via Electron Forge

# Testing
npm test                 # Run all tests (Jest)
npm run test:watch       # Run tests in watch mode
npm run test:unit        # Run unit tests only (src/__tests__)
npm run test:integration # Run integration tests only
npm run test:coverage    # Run tests with coverage report

# Other
npm run lint             # ESLint
npm run type-check       # TypeScript type checking
npm run rebuild          # Rebuild native modules for Electron
```

## Architecture

### Entry Points

- **Electron Main:** `electron/main/index.ts` - App lifecycle, window management, IPC handlers
- **Preload Bridge:** `electron/preload.ts` - Secure ElectronAPI via contextBridge
- **Renderer:** `src/renderer.tsx` - React root with hash-based routing for multiple windows:
  - Default → WorkspaceManager (main editor)
  - `#/record-button` → Floating record dock
  - `#/area-selection` → Screen region selection overlay
  - `#/teleprompter` → Notes window
  - `#/webcam-preview` → Webcam preview

### State Management (Zustand)

Main store at `src/features/core/stores/project-store.ts` composed of 6 slices with Immer middleware:
- **CoreSlice** - Project lifecycle (create, open, save, add recordings)
- **SelectionSlice** - Selected clips, tracks, effects
- **PlaybackSlice** - Playback state (isPlaying, currentTime, scrubbing)
- **TimelineSlice** - Timeline operations (add/update/delete clips and effects)
- **CacheSlice** - Metadata and calculation caching
- **SettingsSlice** - Project settings

Selectors: `src/features/core/stores/selectors/` - Memoized timeline computations

### Rendering Pipeline (Remotion)

```
PreviewAreaRemotion → Remotion Player → TimelineComposition → ClipSequence → Video/Audio/Effects
```

Key files:
- `src/features/rendering/renderer/Root.tsx` - Remotion root composition
- `src/features/rendering/renderer/compositions/TimelineComposition.tsx` - Orchestrates clips, effects, overlays
- `src/components/preview-area-remotion.tsx` - Preview player integration

### Effects System

Effects live in `src/features/effects/` with subdirectories per type:
- **cursor/** - Position, spotlight, motion blur, click ripples
- **zoom/** - Auto-zoom to mouse, smooth transitions, easing curves
- **background/** - Wallpapers, gradients, blur, padding
- **annotation/** - Keyboard shortcuts overlay, click boxes, text, arrows
- **keystroke/** - Visual keyboard event display

Effect application: `src/features/effects/logic/effect-applier.ts`

### Export Pipeline

Export orchestrated in `electron/main/export/`:
1. Validate project settings
2. Generate proxies if needed (4K handling)
3. Remotion renders frames
4. FFmpeg processes video/audio
5. Progress streamed via IPC

### IPC Handlers

25+ handlers in `electron/main/ipc/`:
- `recording.ts` - Record/save/load operations
- `export/` - FFmpeg export pipeline
- `mouse-tracking.ts` / `keyboard-tracking.ts` - Input event capture
- `sources.ts` - Desktop sources and windows
- `permissions.ts` - Screen/mic/camera permissions

## Key Directories

```
electron/
├── main/           # Main process (IPC, windows, services, export)
├── preload.ts      # Context bridge API
└── native/         # Native modules (ScreenCaptureKit)

src/
├── renderer.tsx    # React entry with hash routing
├── components/     # UI components (workspace, toolbar, preview)
├── features/
│   ├── core/       # Stores, commands (undo/redo), storage
│   ├── rendering/  # Remotion compositions, layout engine
│   ├── effects/    # All effect implementations
│   ├── media/      # Recording strategies, library UI
│   └── ui/         # Editor panels, timeline, viewport
└── shared/         # Contexts, utils, types
```

## Production Requirements

**ALL code must work in PRODUCTION (packaged .dmg/.exe):**
- NO external servers or localhost dependencies
- Electron serves Next.js app via webpack (no Next.js server in prod)
- All assets bundled with the app
- Test with `npm run forge:make` to create distributable
- NO FALLBACKS that hide real issues - fix root causes

## Webpack & Routing

- `src/renderer.tsx` routes components via URL hash (`#/record-button`)
- Preload uses `MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY` variable
- Dev: `DEV_SERVER_URL` env var overrides localhost:3000
- Prod: webpack bundles everything, no Next.js server needed

## Tech Stack Notes

- **Remotion** for video composition with frame-accurate timing
- **Zustand + Immer** for state with undo/redo support
- **Radix UI + Tailwind** for UI components
- **Framer Motion** for animations
- **FFmpeg** for video encoding/decoding
- **uiohook-napi** for global mouse/keyboard tracking

## Animation Guidelines

- Use `smoothStep` / `easeOutExpo` for zoom transitions
- Cursor: macOS style with motion blur
- 60fps target throughout preview and export
