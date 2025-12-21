# `src/lib` overview

This directory contains shared library code used by the renderer and Electron main process.

## Major areas

- `src/lib/audio` - audio helpers (analysis, decoding, etc.)
- `src/lib/bridges` - typed wrappers over `window.electronAPI` and IPC
- `src/lib/commands` - command pattern + undo/redo operations
- `src/lib/constants` - shared constants (including effect defaults)
- `src/lib/effects` - effect rendering utilities (cursor/keystroke/background/etc.)
- `src/lib/export` - export pipeline + metadata loading helpers
- `src/lib/keyboard` - keyboard parsing/formatting utilities
- `src/lib/migrations` - project schema migrations
- `src/lib/errors.ts` - shared error types

## Import style

Prefer importing from the concrete module path (e.g. `@/lib/effects/effects-factory`) rather than relying on a barrel export, unless a module explicitly provides one.
