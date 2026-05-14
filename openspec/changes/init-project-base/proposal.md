## Why

The repository is a barely-modified `bun-react-template` (single `src/` with `App.tsx`/`index.ts`/`index.css`). Before building the dual-mode telemetry app described in the README, the foundation needs to encode the actual constraints: a backend/frontend split that can host both a `kiosk` and a `server` runtime, the F1-broadcast color palette and typography from the design section, and self-hosted fonts (the race runs on a Raspberry Pi at the stand where Google Fonts may not be reachable).

Doing this now — once, deliberately — keeps feature work from accreting around a layout that will need to be ripped out later.

## What Changes

- **Reorganize `src/`** into `src/backend/`, `src/frontend/`, and `src/shared/`. The backend folder hosts the Bun server entrypoint and leaves room for future `kiosk`/`server` mode modules; the frontend folder hosts React UI scaffolding with room for future `kiosk`/`remote` surfaces; `src/shared/` hosts cross-cut types and constants. **BREAKING**: existing files at `src/index.ts`, `src/App.tsx`, `src/frontend.tsx`, `src/index.html`, `src/index.css` move under the new tree. `build.ts`, `package.json`, and `tsconfig.json` paths update accordingly.
- **Install Tailwind theme tokens** matching the README color table (`bg`, `panel`, `border`, `yellow`, `text`, `textDim`, `textDimmer`, `green`, `amber`, `red`, `purple`, `ground`, `building`, `park`, `road`, `trackArea`) via Tailwind v4 `@theme` directive in the global CSS. The current `index.css` only does `@import "tailwindcss";` with no tokens.
- **Replace Google-Fonts-based typography** with local font files via `@fontsource/titillium-web` and `@fontsource/jetbrains-mono`, wired into the Tailwind theme as `font-display` and `font-mono` token families. The README design section calls for these two families specifically.
- **Add a `.env.example`** documenting `APP_MODE` (`kiosk`|`server`) and `KIOSK_TELEMETRY_SOURCE` so future mode work has a documented contract from day one. (No mode-switching behavior is implemented — the env vars are not yet read.)
- **Add Biome** with a minimal config so the codebase has a single formatter + linter source of truth before multiple contributors land features. Bun has neither. The formatter runs with project conventions (100-col, double quotes, trailing commas); the linter runs with Biome's `recommended` rule set, which is small enough to land green on the current stub code without curation.
- **Add a `bun test` smoke test** under `src/shared/` to prove the test runner is wired and `tsconfig` path aliases (`@/*`) resolve in tests.
- **Update path aliases** in `tsconfig.json` to add `@backend/*`, `@frontend/*`, `@shared/*` alongside the existing `@/*`, so feature code can import without long relative paths.

Out of scope (deferred to later changes): serial ingestion, SQLite persistence, WebSocket telemetry pipeline, kiosk vs. remote UI implementations, alert engine, mode-selector runtime behavior, weather fetch.

## Capabilities

### New Capabilities

- `project-structure`: how source files are organized across backend, frontend, and shared trees; how Bun build entrypoints, path aliases, and runtime configuration scaffolding (`APP_MODE`, `KIOSK_TELEMETRY_SOURCE`) are wired; how tests and formatting tooling are configured.
- `design-system`: the visual token contract — Tailwind v4 theme entries for the F1-broadcast color palette, locally-hosted typography (Titillium Web for display, JetBrains Mono for numerals/mono), and the requirement that no external font CDN is used at runtime.

### Modified Capabilities

<!-- None — openspec/specs/ is empty; this change introduces the first specs. -->

## Impact

- **Files moved**: `src/index.ts` → `src/backend/index.ts`; `src/App.tsx`, `src/frontend.tsx`, `src/index.html`, `src/index.css` → `src/frontend/`.
- **Files added**: `src/shared/index.ts` (placeholder + types barrel), `src/shared/*.test.ts` (smoke test), `.env.example`, `biome.json`.
- **Files modified**: `package.json` (new deps: `@fontsource/titillium-web`, `@fontsource/jetbrains-mono`, `@biomejs/biome`; updated `dev`/`start` scripts pointing at `src/backend/index.ts`; new `format` script), `build.ts` (entrypoint glob updated for new HTML location), `tsconfig.json` (new path aliases), `src/frontend/index.css` (Tailwind `@theme` with race tokens + `@fontsource` imports), `src/frontend/index.html` (no Google Fonts link).
- **Dependencies added**: `@fontsource/titillium-web`, `@fontsource/jetbrains-mono` (runtime, local font assets), `@biomejs/biome` (dev).
- **No runtime behavior change**: the dev server still serves the same "Hello, World!" page; only the file layout, theme tokens, and font sourcing change.
- **Future changes unblocked**: telemetry ingestion, mode selector wiring, dashboard UI, persistence — all now have a sensible home in the tree.
