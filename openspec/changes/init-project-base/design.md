## Context

The repo is a `bun-react-template` skeleton: one HTML, one React entry, one stub server, no theme. The README already defines the eventual shape — dual-mode runtime (`kiosk` on a Raspberry Pi reading USB serial, `server` on a remote host ingesting forwarded telemetry), two distinct UIs (1920×1080 stand TV and mobile-first remote), an F1-broadcast color palette, and a specific typography pairing (Titillium Web + JetBrains Mono).

Three constraints shape this design:

1. **The kiosk runs on a Raspberry Pi at the stand.** Outbound internet is unreliable: Google Fonts must not be required at runtime; fonts have to ship locally with the bundle.
2. **One codebase, two surfaces.** Backend and frontend will both have a kiosk variant and a server/remote variant. The directory layout has to make that split obvious before either is implemented, so future modules drop into the right slot instead of being grafted on.
3. **No feature work yet.** This change is foundation only. Every decision below should make later feature changes easier; none should pre-implement features.

## Goals / Non-Goals

**Goals:**
- A `src/` tree that visibly separates backend, frontend, and shared code, with subfolders reserved (but empty) for the future kiosk vs. server/remote split.
- A single source of truth for design tokens — colors and font families — readable from any component via Tailwind utilities (`bg-panel`, `text-yellow`, `font-mono`, etc.).
- Fonts served from the app's own bundle, not a third-party CDN.
- A `.env.example` that names the mode-selection env vars from the README, so the contract is documented even though no code reads them yet.
- A working `bun test` and `bun run format` pipeline.
- Existing `bun run dev` / `bun run build` still serve the unchanged "Hello, World!" page after the reorganization.

**Non-Goals:**
- Implementing `APP_MODE` / `KIOSK_TELEMETRY_SOURCE` routing logic.
- Building the dashboard layout, map, sensors, or any race UI.
- Database, WebSocket, serial ingestion, or alert engine.
<!-- Linter is in-scope (Biome `recommended` rules). Curated rule additions beyond the recommended set are deferred. ESLint is rejected; see "Decisions" below. -->
- A CI config. Out of scope for the foundation change.

## Decisions

### Directory structure

```
src/
├── backend/
│   ├── index.ts            ← Bun.serve entrypoint (moved from src/index.ts)
│   ├── kiosk/              ← reserved (.gitkeep) for serial ingest, edge SQLite, forwarder
│   └── server/             ← reserved (.gitkeep) for ingest API, central SQLite, alerts
├── frontend/
│   ├── index.html          ← shell (moved from src/index.html); references frontend.tsx
│   ├── index.css           ← Tailwind import + @theme tokens + @fontsource imports
│   ├── frontend.tsx        ← React bootstrap (moved from src/frontend.tsx)
│   ├── App.tsx             ← root component (moved from src/App.tsx)
│   ├── kiosk/              ← reserved (.gitkeep) for 1920×1080 dashboard
│   └── remote/             ← reserved (.gitkeep) for mobile-first dashboard
└── shared/
    ├── index.ts            ← barrel for cross-cut types/constants
    └── smoke.test.ts       ← bun:test smoke covering `@shared/*` alias
```

Rationale: backend/frontend at the top level is the load-bearing split (different runtimes, different build targets). The kiosk/remote split within each is the *second* axis, and is real per the README but doesn't need code yet — empty `.gitkeep`'d folders signal intent without inviting premature scaffolding. `shared/` exists so future `RaceState` / `RaceStats` types live somewhere both sides can import from without circular dependencies.

**Alternatives considered:**
- `apps/kiosk` + `apps/server` monorepo layout. Rejected: overkill for a single-team weekend race project, and Bun's `serve` already happily hosts both backend routes and HTML bundles from one entrypoint.
- Keeping `src/` flat. Rejected: would force every later change to also do moves, and the README is explicit about two distinct surfaces.

### Design tokens via Tailwind v4 `@theme`

Tailwind v4 ships theme via CSS in the same file as `@import "tailwindcss"`. We add an `@theme` block to `src/frontend/index.css`:

```css
@import "tailwindcss";
@import "@fontsource/titillium-web/700.css";
@import "@fontsource/titillium-web/900.css";
@import "@fontsource/jetbrains-mono/600.css";
@import "@fontsource/jetbrains-mono/800.css";

@theme {
  --color-bg: #0a0a0a;
  --color-panel: #13130f;
  --color-border: rgb(255 255 255 / 0.09);
  --color-yellow: #fbe216;
  --color-text: #ffffff;
  --color-text-dim: rgb(255 255 255 / 0.7);
  --color-text-dimmer: rgb(255 255 255 / 0.45);
  --color-green: #00d97e;
  --color-amber: #ffb000;
  --color-red: #ff3b3b;
  --color-purple: #bf5af2;
  --color-ground: #1c1d1a;
  --color-building: #332e26;
  --color-park: #252e20;
  --color-road: #3d3a35;
  --color-track-area: #88795c;

  --font-display: "Titillium Web", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

This makes `bg-panel`, `text-yellow`, `border-border`, `font-display`, `font-mono` (etc.) available as Tailwind utilities everywhere.

**Alternatives considered:**
- Tailwind `tailwind.config.ts`. Rejected: Tailwind v4 has moved to CSS-first config and the project is already on `tailwindcss@^4.1.11` via `bun-plugin-tailwind`. Following the v4 idiom keeps us aligned with upstream.
- Inline CSS vars without `@theme`. Rejected: loses the `bg-panel`/`text-yellow` ergonomic that makes the palette useful in JSX.

### Local fonts via Fontsource

`@fontsource/titillium-web` ships per-weight CSS files (`700.css`, `900.css`, …) that `@font-face` against bundled `.woff2` files. Importing them from CSS works with `bun-plugin-tailwind` because the Bun bundler resolves the `@import` graph and emits the font files to `dist/`.

Weights pulled (per README §2 "Type system"):
- Titillium Web 700, 900 (display / UI sans)
- JetBrains Mono 600, 800 (numerals)

Only the weights actually used are imported, to keep bundle size predictable.

**Alternatives considered:**
- Direct `.woff2` files committed under `src/frontend/assets/fonts/`. Rejected: pinning font versions through `package.json` is cleaner and keeps the diff small.
- Keeping the existing Google Fonts `<link>` (which is actually not present yet, but the README implies). Rejected: violates the Raspberry-Pi-offline constraint.

### `.env.example`, not a config loader

We add `.env.example` documenting the env vars the README names (`APP_MODE`, `KIOSK_TELEMETRY_SOURCE`) but do not yet add code that reads them. Bun auto-loads `.env`, so when the mode-selector lands later, no extra `dotenv` dependency is needed.

```
# Runtime mode: 'kiosk' (stand TV, reads serial telemetry) or 'server' (remote, ingests from kiosk).
APP_MODE=kiosk

# Kiosk-mode telemetry source: a serial device path (e.g. /dev/ttyUSB0) or 'simulated'.
KIOSK_TELEMETRY_SOURCE=simulated
```

### Path aliases

Add to `tsconfig.json`:

```jsonc
"paths": {
  "@/*":         ["./src/*"],
  "@backend/*":  ["./src/backend/*"],
  "@frontend/*": ["./src/frontend/*"],
  "@shared/*":   ["./src/shared/*"]
}
```

`@/*` is preserved for any code that already uses it. New imports should prefer the specific alias to make the dependency direction visible at the import site.

### Biome, formatter + linter

Biome ships as a single binary that handles formatting, linting, and import sorting. Both formatter and linter are enabled in this change. The linter runs Biome's `recommended` rule set — broad enough to catch real issues, narrow enough to land green on the current stub code without manual curation. Curated rules beyond `recommended` are deferred to a later change when there is enough code to justify the rule-by-rule discussion.

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "ignore": ["dist", "node_modules", "bun.lock"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

Three `package.json` scripts wrap Biome's three primary entry points so contributors don't have to remember the binary flags:

- `format` → `bunx @biomejs/biome format --write .` (formatter only, mutating).
- `lint` → `bunx @biomejs/biome lint .` (linter only, reporting; no auto-fix to avoid silently changing semantics).
- `check` → `bunx @biomejs/biome check --write .` (formatter + linter + import-sort with safe fixes applied; the script most contributors will use day-to-day).

CI wiring is still out of scope for this change.

**Alternatives considered:**
- Prettier + ESLint — two tools, two configs, slower runs. Rejected: Biome covers both roles with one dependency.
- Biome formatter only (the earlier draft of this design) — leaves linting to a follow-up change. Rejected: the `recommended` rule set is small enough that turning it on now is cheaper than scheduling a separate change.
- Bun's built-in tooling — Bun has neither a formatter nor a linter today. Rejected by absence.

### Build wiring

`build.ts` currently scans `src/**/*.html` and the result still works after the move (the new HTML lives at `src/frontend/index.html`). No change needed to the glob. The Bun server entrypoint moves: `package.json` scripts update from `src/index.ts` to `src/backend/index.ts`. The backend file imports `../frontend/index.html` (Bun's HTML import works across folders).

### Testing scaffold

One `bun:test` file under `src/shared/smoke.test.ts` asserts that `@shared/*` resolves and `1 === 1`. Its real job is to fail fast if we break tsconfig or bunfig — it pays for itself the first time someone adds a real test and hits a misconfigured path.

## Risks / Trade-offs

- **Empty reserved folders look like noise** → Mitigation: `.gitkeep` with a one-line comment naming what each folder is for (`# Reserved for kiosk-mode backend: serial ingest, edge SQLite, forwarder.`).
- **Tailwind v4 `@theme` syntax churn** → v4 is recent and the API has shifted. Mitigation: pin the major (`^4.1`) and keep the `@theme` block small enough to fix-up in one diff if upstream tweaks it.
- **Fontsource weight bloat if we keep adding weights "just in case"** → Mitigation: 700/900 + 600/800 only, matching exactly what the README specifies. Anyone adding a new weight must update the README's type-system section first.
- **Path-alias drift between `tsconfig.json` and `bunfig.toml`** → Bun reads tsconfig paths by default for runtime resolution, so they stay in sync automatically. Mitigation: don't duplicate the aliases in `bunfig.toml`.
- **Move breaks an in-flight feature branch** → No active feature branches per `git log`; only docs/bootstrap commits. Acceptable cost.

## Migration Plan

Single PR, single commit:

1. Move existing files into their new homes.
2. Update `package.json` scripts, `tsconfig.json` paths.
3. Install `@fontsource/*` and `@biomejs/biome`.
4. Rewrite `src/frontend/index.css` with `@theme` + `@fontsource` imports.
5. Add `.env.example`, `biome.json`, `.gitkeep`s.
6. Add `src/shared/smoke.test.ts`.
7. Run `bun run dev` and verify the page still loads and one Titillium/JetBrains glyph renders (DevTools → Network: only local font requests).
8. Run `bun test` and verify the smoke test passes.
9. Run `bunx @biomejs/biome format --write .` once to set the baseline.

No rollback plan needed — the change is reversible with `git revert` and touches no shared infrastructure.

## Open Questions

- None blocking. CI wiring and any additions beyond Biome's `recommended` lint rules are deferred to their own future changes.
