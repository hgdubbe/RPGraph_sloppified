# RPGraph Theme Capability Map

Use this as a repository-grounded starting point, not a timeless schema. Verify drift-sensitive details in the current checkout before interviewing or writing a theme.

## Evidence to inspect

| Concern | Primary evidence |
| --- | --- |
| Manifest shape and known keys | `src/app/themeTokens.ts` |
| Inheritance, derivation, flattening | `src/app/themeResolver.ts` |
| Author guidance and locations | `resources/themes/README.md` |
| Engine behavior and limitations | `resources/themes/THEMING-INTERNALS.md` |
| Defaults and conventions | `resources/themes/base/theme.json` and shipped theme folders |
| Browser/dev discovery | `src/app/themeLibrary.browser.ts` |
| Packaged/user discovery | `electron/themeLibrary.cjs`, `src/app/themeRegistry.ts` |
| Runtime application | `src/app/useAppliedTheme.ts` and consuming CSS |
| Regression checks | `src/app/themeTokens.test.ts`, `src/app/studioTheme.test.ts`, `src/app/themeExclusions.test.ts` |

## Verified model in this repository state

- A theme is `resources/themes/<id>/theme.json` when bundled, or `<userData>/themes/<id>/theme.json` for a packaged user's theme. The folder name should match the lowercase hyphenated `id`.
- Authored metadata is `id`, `label`, optional `extends`, optional `hidden`, optional `order`, optional `basic`, and optional nested `tokens`. `source` is loader-added and should not be authored.
- `id` and `label` are the only fields the current loaders structurally validate. JSON validity or loader acceptance does not prove that token names or values produce a usable theme.
- `extends` defaults to `base` except for `base`. Resolution walks the chain root-first and deep-merges token trees; child values win. Cycles and missing parents stop traversal rather than providing a full schema error report.
- The token dictionary is deliberately open. Unknown leaves flatten to CSS variables, but they have no visible effect unless RPGraph CSS consumes those variables. “Accepted” is not the same as “supported.”
- Token leaves are plain CSS-value strings. They may contain colors, font stacks, dimensions, shadows, gradients, `clip-path`, transitions, or `var(...)` expressions as appropriate to the consuming property.
- Resolved values are applied as `--theme-*` custom properties on the `.studio` root and `document.documentElement`, including portaled UI.

## Capability groups

| Group | What is supported | Important behavior |
| --- | --- | --- |
| `color.*` | 21 main palette roles: backgrounds/surfaces, foregrounds, accents, borders, chat bubbles, rail, completion, phone glass | Guaranteed through `base`; drives most of RPGraph and derivations |
| `shell.*` | Play-mode composer, rail, tabs, badges, and topbar chrome | Guaranteed values currently live in `base`; override only for deliberate shell-specific divergence |
| `graph.*` | Graph workbench backgrounds/chrome/panels, lines, text, accent, success, violet | Derived from `color.*` unless explicitly overridden; canvas behind nodes remains unthemeable |
| `storybook.*` | Editor backgrounds/panels/lines/text and accent/violet/pink/lime roles | Most roles derive from `color.*`; inspect resolver and CSS for any non-derived optional roles |
| `app.*` | Shared dialog/global palette and semantic status roles | Structural roles derive from `color.*`; warning/danger and some optional roles may retain CSS fallbacks unless explicitly set |
| `phoneNotes.*`, `phoneChatgpd.*`, `phoneBanking.*`, `phoneGallery.*`, `phoneSocial.*` | Independent palettes for five in-roleplay phone apps | Not derived from the main theme and absent from `base`; customize only by explicit opt-in. Notes tint tokens are bare RGB triplets |
| `typography.*` | Heading/body font stacks, weights, spacing, transform, base size, line height | Does not bundle fonts. Use installed/system-safe stacks unless font availability is separately established |
| `shape.*` | Base and role radii, border width/style, clip path | Role radii fall back in CSS to the theme's base radius |
| `effect.*` | Card/button shadows, hover shadow, text glow, header background texture, button background | Complete CSS property values; placement is fixed by existing consumers |
| `motion.*` | Transition duration/easing and hover scale | Tokenized motion only; no arbitrary keyframes or per-component choreography |
| `raw.*` | Optional one-off literal overrides | Technically overridable but intentionally non-semantic; avoid unless source inspection proves the exact consumer and need |

Read `CORE_TOKEN_KEYS` for the exact current leaf names. Do not copy a broad category description into a specification as if every imagined subkey existed.

## Inheritance and color constraints

- `base` contributes its entire explicit token tree to every descendant before derivation. Do not add fixed overrides merely to be “complete”; they can pre-empt theme-relative derivation.
- `graph.*`, `storybook.*`, and `app.*` are intentionally absent from `base` where they should derive from the selected theme's `color.*` values.
- Basic/color derivation parses `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`, and `rgba()`. HSL, named colors, and CSS Color 4 expressions may render when used directly but cannot reliably feed the resolver's color math. Prefer parseable colors for any source token used by derivation.
- Only the original `color`, `typography`, `shape`, `effect`, and `motion` categories drop their category in generated CSS variable names. Newer categories keep it. Theme authors should use JSON dotted keys, not hand-author flattened CSS names.

## Discovery and destination

- Vite/browser development discovers bundled `resources/themes/*/theme.json` via a static glob. It does not scan the packaged per-user folder.
- Packaged Electron scans bundled and per-user directories. A user theme with the same `id` overrides its bundled counterpart.
- Per-user locations documented by RPGraph are `%APPDATA%\RPgraph Studio\themes\` on Windows, `~/Library/Application Support/RPgraph Studio/themes/` on macOS, and `~/.config/RPgraph Studio/themes/` on Linux.
- Reload/open-folder IPC exists, but the current UI does not invoke it. A newly copied per-user theme normally requires an app restart before it appears in Menu (☰) → Theme.
- Bundled themes are source-controlled application resources; user-authored themes should normally go to the per-user directory so updates do not replace them.

## Verified limitations and exclusions

- Themes alter appearance through existing CSS consumers. They cannot change markup, layout logic, navigation, behavior, or component-render logic.
- There is no light/dark variant object or automatic system-mode switch in one manifest. Separate theme manifests can represent separate variants if the user wants both.
- The Graph-mode xyflow canvas background behind nodes and Node-Backgrounds are not themeable. Sidebars, panels, HUD chrome, and connection lines are.
- Hand-crafted registration/profile content and simulated phone OS content under excluded selector families are not controlled by the shared palette. The five functional phone-app screens are a narrow exception through their independent namespaces.
- A theme can set existing font stacks but cannot package or fetch a font by itself.
- Effects are limited to where existing CSS consumes their tokens. A gradient token does not grant arbitrary background placement; `backgroundTexture`, for example, is used behind the header.
- Unknown/custom tokens may load but remain inert. Never describe loader permissiveness as a theme capability.

## Capability-map discipline

For each requested visual feature, record one row:

| Status | User intent | Concrete RPGraph mapping | Evidence | Preview/validation |
| --- | --- | --- | --- | --- |
| Verified capability / limitation / inference / unknown | What the user wants | Exact dotted key or closest supported interpretation | Current file and relevant symbol/section | How the concept and real file will be checked |

Reclassify inferences and unknowns after inspection. Put unresolved items in the final specification rather than silently filling them with generic web-design assumptions.
