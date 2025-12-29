/**
 * Timeline Operations (Facade)
 * 
 * Centralized entry point for timeline manipulation.
 * Delegates implementation to focused modules:
 * - Reflow & Duration: clip-reflow.ts
 * - Trimming: clip-trim.ts
 * - CRUD: clip-crud.ts
 * - Splitting: clip-split.ts
 * - Creation: clip-creation.ts
 * 
 * @deprecated Prefer importing directly from specialized modules in new code.
 */

export * from './clip-reflow'
export * from './clip-trim'
export * from './clip-crud'
export * from './clip-split'
export * from './clip-creation'
