# bokeh. - Full Feature Implementation

IMPORTANT: YOUR CODE SHOULD BE STREAMLINED BUT NOT OVERLY COMPLEX. AIM FOR A BALANCED APPROACH THAT PRIORITIZES FUNCTIONALITY AND USER EXPERIENCE. REMEMBER, THIS IS A PROFESSIONAL TOOL, SO IT SHOULD BE POLISHED AND EFFICIENT AND PRODUCTION READY. HOWEVER, DO NOT OVER-ENGINEER; KEEP IT SIMPLE AND EFFECTIVE.

## 🚨 PRODUCTION REQUIREMENTS
**ALL code must work in PRODUCTION (packaged .dmg/.exe):**
- NO external servers or localhost dependencies
- Electron must serve the Next.js app internally via webpack
- All assets must be bundled with the app
- Test with `npm run make` to create distributable
- NEVER assume dev server is running
- NO FALLBACKS that hide real issues - fix root causes

## ⚡ CRITICAL WEBPACK CONFIG
- renderer.tsx routes components via URL hash (#/record-button)
- Preload uses MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY variable
- Record button component lives in src/app/record-button/page.tsx
- Dev: DEV_SERVER_URL env var overrides localhost:3000
- Prod: webpack bundles everything, no Next.js server needed

## Required Features (ALL MUST WORK)

### 1. Recording
- [x] Basic screen capture via Electron
- [ ] Multiple source selection (screen/window/app)
- [ ] Audio recording (system + microphone)
- [ ] Webcam overlay with rounded corners
- [ ] 4K/60fps recording support
- [ ] Pause/resume during recording
- [ ] Countdown timer before recording

### 2. Cursor Effects
- [ ] Smooth cursor movement interpolation
- [ ] Cursor spotlight/highlight effect
- [ ] Click ripple animations
- [ ] Cursor motion blur
- [ ] Custom cursor images
- [ ] Hide/show cursor toggle

### 3. Zoom & Motion
- [ ] Automatic zoom to mouse area
- [ ] Smooth zoom in/out animations  
- [ ] Smart panning following cursor
- [ ] Manual zoom controls
- [ ] Zoom presets (2x, 3x, 4x)
- [ ] Easing curves for motion

### 4. Background & Framing
- [ ] Wallpaper backgrounds
- [ ] Gradient backgrounds
- [ ] Background blur
- [ ] Padding/margins around recording
- [ ] Rounded corners on video
- [ ] Drop shadow effects

### 5. Timeline Editing
- [ ] Trim start/end
- [ ] Cut/split clips
- [ ] Multiple tracks
- [ ] Drag to reorder clips
- [ ] Copy/paste clips
- [ ] Undo/redo system
- [ ] Zoom timeline view
- [ ] Frame-by-frame navigation

### 6. Annotations
- [ ] Keyboard shortcuts overlay
- [ ] Click annotations
- [ ] Text overlays
- [ ] Arrow/shape drawing
- [ ] Highlight boxes

### 7. Export
- [ ] MP4/MOV/GIF export
- [ ] Quality presets
- [ ] Custom resolution
- [ ] Framerate options
- [ ] Progress bar with cancel
- [ ] Batch export

### 8. Performance
- [ ] GPU acceleration via WebGL
- [ ] Real-time preview at 60fps
- [ ] Efficient memory management
- [ ] Background rendering
- [ ] Fast scrubbing

## Implementation Priority

1. **Fix video playback** - Timeline must show actual video preview
2. **Implement zoom effects** - Core Bokeh feature
3. **Add cursor rendering** - Smooth, professional cursor overlay
4. **Background system** - Gradient/image backgrounds
5. **Timeline editing** - Cut, trim, split functionality
6. **Export with effects** - Apply all effects during export
7. **Polish animations** - Smooth 60fps throughout

## Commands
```bash
npm run electron-dev     # Development
npm run build-electron   # Production build
npm test                 # Run all tests automatically
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:e2e        # Run end-to-end tests only
npm run test:autoclick   # Quick test for auto-click feature
```

## Test Structure
```
tests/
├── unit/               # Fast isolated tests (constraints, effects, export)
├── integration/        # Component integration tests
├── e2e/               # Full app end-to-end tests
└── run-all.js         # Master test runner
```

## 🎯 QUICK REMINDERS
- Zoom: smoothStep/easeOutExpo for native feel
- Cursor: macOS style with motion blur implemented
- Export: frame caching = 30-50% faster
- Background: renderer ready, needs UI controls
- Audio: works, needs system capture permissions
- Timeline: basic only, NO editing yet
- Webcam: NOT implemented
- Export: WebM only, needs FFmpeg for MP4