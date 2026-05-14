# design-system Specification

## Purpose

Defines the foundational visual language for the application: the F1-broadcast color palette exposed as Tailwind v4 theme tokens, and the locally-bundled typography (Titillium Web and JetBrains Mono via Fontsource) registered as font-family theme tokens. This capability ensures the UI has a consistent, dependency-free design vocabulary that components reference via Tailwind utilities rather than hardcoded literals.

## Requirements

### Requirement: Race color palette is exposed as Tailwind theme tokens

The application's frontend stylesheet SHALL register the F1-broadcast color palette from the project README as Tailwind v4 theme tokens, declared via an `@theme` block inside the global CSS file (`src/frontend/index.css`).

The following tokens SHALL be defined, with these exact hex/rgba values (matching the README §2 "Color tokens" table):

| Tailwind utility class root | CSS custom property | Value |
|---|---|---|
| `bg-bg` / `text-bg` / `border-bg` | `--color-bg` | `#0a0a0a` |
| `*-panel` | `--color-panel` | `#13130f` |
| `*-border` | `--color-border` | `rgb(255 255 255 / 0.09)` |
| `*-yellow` | `--color-yellow` | `#fbe216` |
| `*-text` | `--color-text` | `#ffffff` |
| `*-text-dim` | `--color-text-dim` | `rgb(255 255 255 / 0.7)` |
| `*-text-dimmer` | `--color-text-dimmer` | `rgb(255 255 255 / 0.45)` |
| `*-green` | `--color-green` | `#00d97e` |
| `*-amber` | `--color-amber` | `#ffb000` |
| `*-red` | `--color-red` | `#ff3b3b` |
| `*-purple` | `--color-purple` | `#bf5af2` |
| `*-ground` | `--color-ground` | `#1c1d1a` |
| `*-building` | `--color-building` | `#332e26` |
| `*-park` | `--color-park` | `#252e20` |
| `*-road` | `--color-road` | `#3d3a35` |
| `*-track-area` | `--color-track-area` | `#88795c` |

The `@theme` block MUST appear in `src/frontend/index.css` after `@import "tailwindcss";`. No color values from this palette MAY be hardcoded as hex literals in component JSX/CSS — components SHALL reference them via Tailwind utilities (e.g. `bg-panel`, `text-yellow`).

#### Scenario: Tailwind utilities use the palette tokens
- **WHEN** a developer writes `<div className="bg-panel text-yellow">` in any component
- **THEN** the dev build resolves the classes and renders the div with background `#13130f` and text color `#fbe216`

#### Scenario: Theme tokens are declared in the global stylesheet
- **WHEN** `src/frontend/index.css` is read
- **THEN** it contains an `@theme { ... }` block defining every CSS custom property listed in the table above with the listed value

#### Scenario: No raw hex literal duplicates the palette
- **WHEN** a contributor adds a component that needs a palette color
- **THEN** they reference it through a Tailwind utility (`bg-yellow`, `text-purple`, etc.), not via an inline `#fbe216` or hex string

### Requirement: Typography uses locally-bundled fonts via Fontsource

The application SHALL load its two typefaces from packages installed via npm/bun, not from a third-party font CDN at runtime.

The frontend SHALL depend on:
- `@fontsource/titillium-web` — providing the "Titillium Web" display family.
- `@fontsource/jetbrains-mono` — providing the "JetBrains Mono" monospace family.

The following per-weight stylesheets SHALL be `@import`ed from `src/frontend/index.css` (no other weights):
- `@fontsource/titillium-web/700.css`
- `@fontsource/titillium-web/900.css`
- `@fontsource/jetbrains-mono/600.css`
- `@fontsource/jetbrains-mono/800.css`

The frontend HTML shell (`src/frontend/index.html`) MUST NOT include `<link>` tags pointing at `fonts.googleapis.com`, `fonts.gstatic.com`, or any other external font origin.

#### Scenario: Fontsource packages are project dependencies
- **WHEN** `package.json` is read
- **THEN** its `dependencies` field includes `@fontsource/titillium-web` and `@fontsource/jetbrains-mono`

#### Scenario: Only the documented weights are imported
- **WHEN** `src/frontend/index.css` is read
- **THEN** it imports exactly the four per-weight stylesheets listed above and no other weights from either font package

#### Scenario: Production build emits font files locally
- **WHEN** a developer runs `bun run build`
- **THEN** `dist/` contains the `.woff2` font files referenced by the bundled CSS, served from the same origin as the app

#### Scenario: No external font CDN is requested at runtime
- **WHEN** the running app is opened in a browser and DevTools → Network is inspected
- **THEN** no request is made to `fonts.googleapis.com`, `fonts.gstatic.com`, or any other third-party font origin

### Requirement: Font families are exposed as Tailwind theme tokens

The `@theme` block in `src/frontend/index.css` SHALL register two font-family tokens so the typefaces are usable via Tailwind utilities throughout the app.

Required tokens (Tailwind v4 maps `--font-<name>` to `font-<name>` utility):

| Tailwind utility | CSS custom property | Value |
|---|---|---|
| `font-display` | `--font-display` | `"Titillium Web", system-ui, sans-serif` |
| `font-mono` | `--font-mono` | `"JetBrains Mono", ui-monospace, monospace` |

System fallbacks MUST be present so the UI degrades to a usable state if the bundled font files fail to load.

#### Scenario: Display utility applies Titillium Web
- **WHEN** a component renders `<h1 className="font-display">`
- **THEN** the computed `font-family` resolves to a stack starting with `"Titillium Web"` and falls back to `system-ui` and `sans-serif`

#### Scenario: Mono utility applies JetBrains Mono
- **WHEN** a component renders `<span className="font-mono tabular-nums">`
- **THEN** the computed `font-family` resolves to a stack starting with `"JetBrains Mono"` and falls back to `ui-monospace` and `monospace`
