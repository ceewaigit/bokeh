# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` holds Next.js App Router routes; `src/components/`, `src/lib/`, `src/hooks/`, and `src/types/` contain UI, core logic, hooks, and types.
- `electron/` contains the main process (`electron/main/`), preload bridge (`electron/preload.ts`), and native modules (`electron/native/`).
- `public/` and `resources/` store static assets and packaged binaries/models used by the app.
- Tests live in `tests/` (plus some Jest tests under `src/__tests__/`). Build helpers are in `scripts/`.

## Build, Test, and Development Commands
- `npm run electron-dev`: run Next.js dev + Electron together (primary dev workflow).
- `npm run dev`: Next.js dev server only.
- `npm run electron`: build Electron main/preload and launch the app.
- `npm run build`: Next.js production build (with path fixes).
- `npm run build-electron`: full production build (Next.js + Electron + builder).
- `npm run lint` / `npm run type-check`: ESLint and TypeScript checks.
- `npm test` / `npm run test:watch` / `npm run test:coverage`: Jest runs.

## Coding Style & Naming Conventions
- Use TypeScript for app code; define explicit interfaces and avoid implicit `any`.
- React components are functional with hooks; name components in `PascalCase`.
- Hooks are `useSomething`; stores are kept domain-specific (recording, timeline, export).
- Indentation is 2 spaces in JS/TS/JSON, matching existing files.
- Styling uses Tailwind classes and shadcn/ui components; keep UI consistent and accessible.

## Testing Guidelines
- Jest is configured via `jest.config.js` with coverage thresholds (global 20%, higher for `src/lib/recording/**`).
- Unit tests use `*.test.ts`/`*.test.js` naming in `tests/unit/` and `src/__tests__/`.
- Integration tests live in `tests/integration/`; run targeted suites with `npm run test:unit` or `npm run test:integration`.

## Commit & Pull Request Guidelines
- Use Conventional Commits with optional scopes, e.g. `feat(timeline): add zoom preset` or `fix: improve ffmpeg progress parsing`.
- Branch naming follows `feature/`, `fix/`, `docs/`, `refactor/` prefixes.
- PRs should describe behavior changes, testing performed, and include screenshots/recordings for UI changes.

## Packaging & Production Notes
- The Electron app must run without a dev server; webpack bundles the Next.js renderer for production.
- Avoid external runtime dependencies; assets and binaries must be packaged.
- Validate production builds with `npm run build-electron` or `npm run forge:make` before release.
