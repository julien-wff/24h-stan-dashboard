## 1. Dependencies

- [x] 1.1 Install `@fontsource/titillium-web` and `@fontsource/jetbrains-mono` as runtime dependencies (`bun add @fontsource/titillium-web @fontsource/jetbrains-mono`).
- [x] 1.2 Install `@biomejs/biome` as a dev dependency (`bun add -d @biomejs/biome`).

## 2. Source tree reorganization

- [x] 2.1 Create directories `src/backend/`, `src/backend/kiosk/`, `src/backend/server/`, `src/frontend/`, `src/frontend/kiosk/`, `src/frontend/remote/`, `src/shared/`.
- [x] 2.2 Move `src/index.ts` → `src/backend/index.ts`.
- [x] 2.3 Move `src/index.html`, `src/frontend.tsx`, `src/App.tsx`, `src/index.css` → `src/frontend/`.
- [x] 2.4 Update `src/backend/index.ts` to import the HTML shell from `../frontend/index.html`.
- [x] 2.5 Add `.gitkeep` files to `src/backend/kiosk/`, `src/backend/server/`, `src/frontend/kiosk/`, `src/frontend/remote/`, each containing a one-line `#` comment naming the folder's intended use.
- [x] 2.6 Verify no source file remains directly under `src/` (only the three subtree directories).

## 3. Path aliases

- [x] 3.1 Update `tsconfig.json` `compilerOptions.paths` to add `@backend/*`, `@frontend/*`, `@shared/*` alongside the existing `@/*`.
- [x] 3.2 Confirm `bunfig.toml` does not duplicate path aliases (Bun reads them from `tsconfig.json`).

## 4. Build wiring

- [x] 4.1 Update `package.json` `scripts.dev` to `bun --hot src/backend/index.ts`.
- [x] 4.2 Update `package.json` `scripts.start` to `NODE_ENV=production bun src/backend/index.ts`.
- [x] 4.3 Verify `build.ts`'s `src/**/*.html` glob picks up the new `src/frontend/index.html` without changes.
- [x] 4.4 Add three Biome scripts to `package.json`: `format` → `bunx @biomejs/biome format --write .`; `lint` → `bunx @biomejs/biome lint .`; `check` → `bunx @biomejs/biome check --write .`.

## 5. Design tokens (colors)

- [x] 5.1 In `src/frontend/index.css`, add an `@theme { ... }` block after `@import "tailwindcss";` declaring all 16 race-palette `--color-*` custom properties with the exact values from `specs/design-system/spec.md`.

## 6. Typography

- [x] 6.1 In `src/frontend/index.css`, add the four `@fontsource` imports: `titillium-web/700.css`, `titillium-web/900.css`, `jetbrains-mono/600.css`, `jetbrains-mono/800.css`.
- [x] 6.2 In the `@theme` block, declare `--font-display: "Titillium Web", system-ui, sans-serif;` and `--font-mono: "JetBrains Mono", ui-monospace, monospace;`.
- [x] 6.3 Confirm `src/frontend/index.html` contains no `<link>` to `fonts.googleapis.com` or `fonts.gstatic.com` (it currently has none; verify after move).

## 7. Runtime config scaffolding

- [x] 7.1 Create `.env.example` at the repo root with `APP_MODE` (kiosk|server) and `KIOSK_TELEMETRY_SOURCE` (serial path | `simulated`), each with a comment line describing accepted values.
- [x] 7.2 Confirm `.env` is already in `.gitignore`; if not, add it.

## 8. Biome config

- [x] 8.1 Create `biome.json` at the repo root with: `$schema` pointing at the installed Biome version, `formatter.enabled: true`, `indentStyle: "space"`, `indentWidth: 2`, `lineWidth: 100`, `javascript.formatter.quoteStyle: "double"`, `javascript.formatter.trailingCommas: "all"`, `files.ignore: ["dist", "node_modules", "bun.lock"]`, `linter.enabled: true`, `linter.rules.recommended: true`.
- [x] 8.2 Run `bun run check` once to set the baseline (applies formatter + import sort + safe lint fixes); commit the resulting reformat (if any) as part of this change.
- [x] 8.3 If `bun run lint` reports any `recommended`-rule violations on the post-baseline tree, fix them inline (rename unused imports, drop dead branches, etc.) so the lint baseline is clean. Do NOT add per-file `biome-ignore` comments to mask issues.

## 9. Shared barrel and smoke test

- [x] 9.1 Create `src/shared/index.ts` exporting a single placeholder constant (e.g. `export const SHARED_OK = true;`) so the barrel is importable.
- [x] 9.2 Create `src/shared/smoke.test.ts` that imports `SHARED_OK` via `@shared/index` (or `@shared/`), asserts it is `true`, and includes one trivial `expect(1).toBe(1)` to confirm `bun:test` works.

## 10. Verification

- [x] 10.1 Run `bun install` and confirm the new dependencies install cleanly.
- [ ] 10.2 Run `bun run dev`, open the printed URL, confirm the `<h1>Hello, World!</h1>` page renders without console errors.
- [ ] 10.3 In DevTools → Network, confirm no requests to `fonts.googleapis.com` or `fonts.gstatic.com`; confirm `.woff2` files are served from the local origin.
- [ ] 10.4 Apply a sanity utility like `<h1 className="font-display text-yellow">` temporarily and confirm Titillium Web at color `#fbe216` renders, then revert.
- [x] 10.5 Run `bun test` and confirm the smoke test passes with exit code 0.
- [x] 10.6 Run `bun run build` and confirm `dist/` contains the bundled HTML and the four `.woff2` font files.
- [x] 10.7 Run `bun run format` and confirm Biome exits 0 with no further changes after the baseline pass.
- [x] 10.8 Run `bun run lint` and confirm Biome reports zero `recommended`-rule violations.
- [x] 10.9 Run `bun run check` and confirm it exits 0 with no further changes after the baseline pass.

## 11. Documentation

- [x] 11.1 Update the README §4 "Repository structure" tree to reflect the new `src/backend/`, `src/frontend/`, `src/shared/` layout.
- [x] 11.2 In README §2 "Type system", replace the "loaded via Google Fonts" credit with "bundled locally via `@fontsource/*`".
