# project-structure Specification

## Purpose

Defines the repository's source-tree layout, TypeScript path aliases, runtime-mode environment contract, formatter/linter tooling, and the smoke-test baseline. This capability establishes the conventions every future change builds on: where backend, frontend, and shared code live; how they import each other; how the app's runtime mode is configured; and how code is kept formatted, linted, and tested.

## Requirements

### Requirement: Source tree separates backend, frontend, and shared code

The repository SHALL organize all application source under `src/` into three top-level subtrees:

- `src/backend/` — Bun-runtime code (HTTP/WS server, telemetry ingestion, persistence). MUST contain the server entrypoint at `src/backend/index.ts`.
- `src/frontend/` — Browser-runtime code (React app, HTML shell, CSS). MUST contain `index.html`, `frontend.tsx`, `App.tsx`, and `index.css`.
- `src/shared/` — Code importable by both backend and frontend (types, constants, pure helpers). MUST contain at minimum a barrel file `src/shared/index.ts`.

Each of `src/backend/` and `src/frontend/` SHALL reserve `kiosk/` and (for backend) `server/` or (for frontend) `remote/` subdirectories, each containing a `.gitkeep` whose content names the future purpose of the folder.

No source file MAY live directly under `src/` (i.e. outside one of the three subtrees), other than directory placeholders.

#### Scenario: Backend entrypoint lives in backend tree
- **WHEN** a developer runs `bun run dev`
- **THEN** the script invokes `src/backend/index.ts` (per `package.json`) and the server starts successfully

#### Scenario: Frontend assets live in frontend tree
- **WHEN** the Bun bundler builds the app
- **THEN** the HTML entrypoint at `src/frontend/index.html` is resolved by the `src/**/*.html` glob in `build.ts` and emits a `dist/` output

#### Scenario: Shared module is importable from both sides
- **WHEN** `src/backend/index.ts` and `src/frontend/App.tsx` both `import { ... } from "@shared/..."`
- **THEN** both imports resolve via the `@shared/*` tsconfig path alias without circular-dependency warnings

#### Scenario: Reserved subdirectories are committed but empty
- **WHEN** a developer clones the repository
- **THEN** `src/backend/kiosk/`, `src/backend/server/`, `src/frontend/kiosk/`, and `src/frontend/remote/` each exist, contain only a `.gitkeep` file, and `.gitkeep` names the folder's intended use in a one-line comment

### Requirement: TypeScript path aliases mirror the source tree

`tsconfig.json` SHALL declare path aliases for each top-level source subtree so feature code can avoid deep relative imports.

Required aliases:
- `@/*` → `./src/*` (preserved from the existing config)
- `@backend/*` → `./src/backend/*`
- `@frontend/*` → `./src/frontend/*`
- `@shared/*` → `./src/shared/*`

The aliases SHALL resolve in both the Bun runtime and `bun test`. Aliases MUST NOT be duplicated in `bunfig.toml`.

#### Scenario: Backend code imports shared via alias
- **WHEN** `src/backend/index.ts` writes `import { foo } from "@shared/foo"`
- **THEN** `bun run dev` resolves the import and starts the server

#### Scenario: Test file resolves shared alias
- **WHEN** a test under `src/shared/` imports another `@shared/*` module
- **THEN** `bun test` runs the test without an unresolved-module error

### Requirement: Documented runtime mode contract via `.env.example`

The repository SHALL provide a `.env.example` file at the repository root that documents every environment variable the runtime will consume in future changes.

At minimum, `.env.example` SHALL define and comment:
- `APP_MODE` — accepted values `kiosk` and `server`, with a one-line description of each.
- `KIOSK_TELEMETRY_SOURCE` — accepted forms (a serial device path such as `/dev/ttyUSB0`, or the literal string `simulated`).

The file SHALL NOT be a working `.env` (no real credentials). The actual `.env` file SHALL remain gitignored.

This change does NOT require any code to read these variables; the file is a contract document for future work.

#### Scenario: `.env.example` exists and is committed
- **WHEN** the repository is cloned
- **THEN** `.env.example` is present at the repository root and is tracked by git

#### Scenario: `.env.example` names the required variables
- **WHEN** a developer reads `.env.example`
- **THEN** it contains lines defining `APP_MODE` and `KIOSK_TELEMETRY_SOURCE` with accompanying comments naming their accepted values

#### Scenario: `.env` is not committed
- **WHEN** a developer creates a local `.env` from the example
- **THEN** `.gitignore` prevents `.env` from being staged

### Requirement: Formatter and linter are wired and runnable

The repository SHALL provide Biome as the single source of truth for formatting and linting.

The configuration SHALL live at `biome.json` in the repository root and SHALL:
- Enable the formatter (`formatter.enabled: true`) with `indentStyle: "space"`, `indentWidth: 2`, `lineWidth: 100`.
- Set JavaScript/TypeScript formatting to `quoteStyle: "double"` and `trailingCommas: "all"`.
- Enable the linter (`linter.enabled: true`) with Biome's `recommended` rule set turned on (`rules.recommended: true`). Curated rule overrides beyond the recommended set are out of scope for this change.
- Ignore `dist/`, `node_modules/`, and `bun.lock`.

`package.json` SHALL define three scripts wrapping Biome's primary entry points:
- `format` → invokes Biome's formatter with auto-write (`bunx @biomejs/biome format --write .` or equivalent).
- `lint` → invokes Biome's linter in reporting mode (`bunx @biomejs/biome lint .` or equivalent) — no auto-fix, so a successful run reflects an actually-clean codebase.
- `check` → invokes Biome's combined formatter + linter + import-sort with safe fixes applied (`bunx @biomejs/biome check --write .` or equivalent).

CI checks are out of scope for this requirement.

#### Scenario: Format script formats the codebase
- **WHEN** a developer runs `bun run format`
- **THEN** Biome rewrites any non-conforming file under tracked paths and exits with status 0

#### Scenario: Lint script reports a clean baseline
- **WHEN** a developer runs `bun run lint` on a fresh checkout after the change is applied
- **THEN** Biome reports zero `recommended`-rule violations and exits with status 0

#### Scenario: Check script applies safe fixes
- **WHEN** a developer runs `bun run check`
- **THEN** Biome applies formatter, import-sort, and safe lint fixes in one pass and exits with status 0

#### Scenario: Generated and lockfile paths are skipped
- **WHEN** any of `bun run format`, `bun run lint`, or `bun run check` runs against a fresh checkout
- **THEN** `dist/`, `node_modules/`, and `bun.lock` are not modified or read

### Requirement: Test runner is wired with a smoke test

The repository SHALL include at least one `bun:test` file proving the test runner works and path aliases resolve in tests.

The smoke test SHALL live at `src/shared/smoke.test.ts` and SHALL:
- Import at least one symbol from `@shared/*`.
- Contain at least one passing assertion.

`bun test` SHALL exit with status 0 on a clean repository.

#### Scenario: Smoke test passes
- **WHEN** a developer runs `bun test`
- **THEN** the suite reports at least one passing test and exits with status 0

#### Scenario: Smoke test exercises the shared alias
- **WHEN** the smoke test imports from `@shared/...`
- **THEN** the import resolves and the imported symbol is referenced in an assertion (not unused)

### Requirement: Existing dev/build/start scripts continue to work after reorganization

After the reorganization, `bun run dev`, `bun run start`, and `bun run build` SHALL produce the same observable behavior they did before: the dev server starts, serves the React app at `/`, and `bun run build` emits a `dist/` directory containing the bundled HTML and assets.

No feature behavior change is introduced by this change — only file locations, theme tokens, font sources, and tooling change.

#### Scenario: Dev server serves the React app
- **WHEN** a developer runs `bun run dev` and opens the printed URL
- **THEN** the page renders the React app (currently `<h1>Hello, World!</h1>`) without console errors

#### Scenario: Production build emits assets
- **WHEN** a developer runs `bun run build`
- **THEN** `dist/` contains a bundled HTML file and its referenced JS/CSS/font assets
