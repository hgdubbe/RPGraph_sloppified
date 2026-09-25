# Phone home-screen theme engine — agent-facing notes

Architecture reference for the phone's own OS-chrome theme engine. This is a **second,
fully independent** instance of the Studio theme engine's exact architecture (see
`resources/themes/THEMING-INTERNALS.md`, which you should also read — this file assumes
familiarity with it and mirrors its structure), scoped one level down: it themes only
the phone's home screen ("OS chrome" — wallpaper scrim, clock widget, desktop widgets,
app-icon labels, notification badges, the mood-status dot, the bottom favorites dock).

It replaced an earlier, rejected shortcut (three hardcoded `.phone-theme-<id>` CSS
classes with a fixed array, no manifests, no resolver) that didn't match the Studio
engine's shape. If you find references to `phone-theme-classic`/`phoneThemes.ts`/
`phone-themes.css` anywhere, they're stale — that approach was deleted.

## Where everything lives

| Piece | File |
|---|---|
| Token types, core token list, guaranteed set | `src/app/phoneHomeThemeTokens.ts` |
| Pure resolution algorithm (extends chain, derivation, base fallback, flatten) | `src/app/phoneHomeThemeResolver.ts` |
| Loads manifests (dev glob / packaged IPC), exposes picker helpers | `src/app/phoneHomeThemeRegistry.ts` |
| Applies resolved tokens to the DOM, `.roleplay-phone-device` only | `src/app/useAppliedPhoneHomeTheme.ts` |
| Browser/dev-mode loader (`import.meta.glob`), bundled tier only | `src/app/phoneHomeThemeLibrary.browser.ts` |
| Packaged-mode loader: scans both tiers, merges by id | `electron/phoneHomeThemeLibrary.cjs` |
| IPC registration (`phone-home-theme-library:get/reload/open-folder`, `:changed` push) | `electron/main.cjs` |
| Bridge exposure | `electron/preload.cjs`, typed in `src/electron.d.ts` |
| Bundled theme data | `resources/phone-themes/<id>/phone-theme.json` |
| User-authored theme data (packaged mode only) | `<userData>/phone-themes/<id>/phone-theme.json` |
| Wiring: ref on `.roleplay-phone-device`, hook call | `src/components/RoleplayPhoneDevice.tsx` |
| Wiring: state, storage key, registry instantiation, props into the phone | `src/App.tsx` (search `phoneHomeTheme`) |
| Settings-tray "Theme" `<select>` (unchanged visually; just correctly wired) | `src/components/PhonePanel.tsx` (search `phone-desktop-theme-select`) |
| Consuming CSS (unchanged by this engine — already consumed these var names) | `src/styles/phone-widgets.css` |

Color math (`lighten`/`mix`/`contrastingText`) is reused directly from the Studio
engine's `src/app/themeColorMath.ts` — that file has no engine-specific state, so
sharing it isn't a violation of "these are independent systems," any more than sharing
`Math.min` would be.

## The model, in one paragraph

Identical to the Studio engine's model, scaled down: a `phone-theme.json` has an id, a
label, an optional `extends` parent (defaults to `"base"`), an optional `basic` tier
(`primary`/`background` — the only two knobs this token set needs), and a `tokens` tree
nested one level under a single `phoneHome` category (e.g.
`{"phoneHome": {"accent": "#ff7626"}}`). `resolvePhoneHomeTheme(manifests, id)` in
`phoneHomeThemeResolver.ts` walks the `extends` chain root-first, deep-merges the
`tokens` trees (child wins), fills any still-unset token from a derivation rule or from
`base`, flattens every surviving key into a `--theme-phone-home-<kebab-leaf>` CSS custom
property name, and returns a flat `{name: value}` map ready for
`element.style.setProperty`.

## The token set

Fourteen leaves, all under one dotted category (`phoneHome.*`), matching the fourteen
`--theme-phone-home-*` custom properties `phone-widgets.css` consumes:

- **Color (10, all guaranteed):** `scrim`, `accent`, `accentStrong`, `clockBackground`,
  `clockText`, `widgetBackground`, `label`, `badge`, `badgeBanking`, `online`. Every one
  of these is force-backfilled from `base` when nothing else supplies it, so every
  phone-home theme resolves a complete, self-consistent color palette rather than
  partially falling through to `phone-widgets.css`'s own literal fallbacks.
- **Shape (2, guaranteed):** `iconRadius` (the app-icon grid's corner radius, default
  `28%` — a percentage, not a fixed px, so it scales with icon size) and `cardRadius`
  (shared by the clock widget, desktop widgets, and the bottom dock; each has its own
  literal CSS fallback — 24px/20px/28px respectively — so leaving `cardRadius` unset
  preserves each element's own distinct roundedness, while setting it flattens all three
  to one uniform value). This is what makes a "sharp-cornered" theme (e.g. `mono`,
  `iconRadius: "10%"`, `cardRadius: "4px"`) a two-line change instead of a CSS rewrite.
- **Icon coloring (2, deliberately NOT guaranteed — no `base` entry):**
  `iconBackground`, `iconBorder`. Unset (every shipped theme except `mono`), each of the
  nine app icons keeps its own hand-picked gradient/border exactly as shipped (whatsup
  green, camera gray, matchme/onlyfriends pink, the other five transparent-glass with a
  shared white border) — `phone-widgets.css` expresses that per-app default as this
  leaf's own CSS fallback, not as a `base.json` value, mirroring the same
  guaranteed-vs-optional reasoning `themeResolver.ts` uses for `shape.radiusCard`.
  **Set**, every one of the nine icons flattens to that single background/border,
  because all four of the icon-coloring override rules in `phone-widgets.css` read the
  same two custom properties — this is the mechanism behind a genuinely monochrome icon
  set, demonstrated by the shipped `mono` theme.

## Variable-name compatibility with the Studio engine

The Studio resolver's `CATEGORIES_DROPPED_FROM_VAR_NAME` set drops five original
categories (`color`/`typography`/`shape`/`effect`/`motion`) from the compiled variable
name for backward compatibility, but keeps every category added since (`graph`,
`storybook`, `phoneBanking`, `phoneSocial`, etc.) in the name to avoid leaf collisions.
This engine's resolver has no such set at all — its only category, `phoneHome`, is
always kept, the same behavior the Studio resolver already gives every non-legacy
category. `phoneHome.scrim` compiles to `--theme-phone-home-scrim`, matching
`phone-widgets.css`'s existing `var(--theme-phone-home-scrim, ...)` calls exactly — no
edits were needed in that file for this engine to work.

## Derivation

Unlike the Studio engine's `DERIVATION_RULES` (large, only a handful of tokens without
a CSS fallback are guaranteed), this engine's derivation table is small but *complete*:
every one of the ten tokens has a rule, because the token set is small enough that all
of it plausibly derives from just two basic-tier knobs — `primary` feeds the accent
family (`accent` → `accentStrong` darkened from it → `badge`/`badgeBanking` off of
those), `background` feeds the surface family (`scrim`/`clockBackground`/
`widgetBackground` directly, `clockText`/`label` as contrasting text against
`clockBackground`, `online` as a strong lighten of `background`). A theme.json-style
advanced `tokens` entry always wins over a derived value — derivation only fills a token
still unset after the `extends` merge. None of the four shipped manifests (`base`,
`classic`, `hardcore`, `calm`) currently rely on derivation; they all set every leaf
explicitly. The hook exists so a future minimal phone-theme editor could offer just a
two-color picker and still get a coherent result.

## Isolation from the Studio theme — the load-bearing property

`useAppliedPhoneHomeTheme` (`src/app/useAppliedPhoneHomeTheme.ts`) is a near-exact copy
of `useAppliedTheme.ts`, with one deliberate difference: it writes resolved custom
properties **only** onto the ref'd element (`.roleplay-phone-device`, passed in from
`RoleplayPhoneDevice.tsx`), never onto `document.documentElement`.

`useAppliedTheme.ts` writes to both its own root ref *and* `document.documentElement`,
because a few Studio components (e.g. `NodeCustomSelect`'s dropdown) render via
`createPortal(..., document.body)`, escaping the root ref's subtree — custom properties
only inherit down the actual DOM tree, not the React tree, so without the
`document.documentElement` write those portaled elements would never see a theme
change.

`RoleplayPhoneDevice` doesn't have that problem: its own "escape the visible screen"
mechanism — the tray dropdown menus opened from the status bar — render into an overlay
layer (`trayOverlayRef`, rendered as `<div className="roleplay-phone-overlay-layer" />`)
that is a **literal DOM child of `.roleplay-phone-device` itself**, not a
`createPortal(..., document.body)` escape hatch. So every consumer of
`--theme-phone-home-*` (status bar, home button, screen, and those tray menus) is a
genuine DOM descendant of `.roleplay-phone-device`, and setting the custom properties
there is sufficient for all of them. There is no missing-descendant case that would
require also writing to `document.documentElement` — and doing so anyway would be a
real bug: it would leak the phone's home-screen theme choice back out to the rest of the
Studio (since `document.documentElement` sits above literally everything), silently
recoloring unrelated Studio chrome that happens to reuse the same property names, or
colliding with anything the Studio's own `useAppliedTheme` writes for the `phoneHome.*`
theme.json namespace (system 2 in `THEMING-INTERNALS.md`) at the document root. If you
ever touch this hook, do not add a `document.documentElement` write — verify by opening
the phone's settings tray, switching its "Theme" selector, and confirming the Studio's
own topbar/chat-panel colors (and the phone's five in-world apps) don't move.

## Gotcha: the app-icon classes collide with each app's own stylesheet

`phone-widgets.css`'s icon overrides target classes like `.phone-gallery-icon`,
`.phone-banking-icon`, `.phone-notes-icon`, `.phone-chatgpd-icon`, and (via
`phone-social.css`) `.phone-fotogram-icon` — these are the home-screen app-icon
*glyphs*. Five of those exact class names are **also** defined, completely
independently, in that app's own stylesheet (`phone-gallery.css`, `phone-banking.css`,
`phone-notes.css`, `phone-chatgpd.css`, `phone-social.css`), tied to that app's *own*
in-phone-app-theme namespace (e.g. `phone-gallery.css`'s `.phone-gallery-icon` reads
`--theme-phone-gallery-muted`/`--theme-phone-gallery-line`, not anything from this
engine) — a coincidental, pre-existing class-name reuse between "the icon on the home
screen" and "something inside that app's own screen," not a bug introduced by this
engine.

Those five files load *after* `phone-widgets.css` in `src/styles/index.css`, so a plain
`.phone-gallery-icon { ... }` override written in `phone-widgets.css` loses to theirs at
equal specificity — it parses fine, resolves fine, and then silently never applies,
which is exactly what happened the first time `iconBackground`/`iconRadius` were added
here (caught by comparing a `mono`-themed icon's live `getComputedStyle` against the
token that was supposed to be driving it). The fix, already in place: every icon
override in `phone-widgets.css` uses the compound selector `.phone-desktop-app >
.phone-X-icon` (plus `.phone-desktop-dock-app > .phone-X-icon` for the four icon
classes that also appear in the bottom dock), never the bare `.phone-X-icon` class —
two classes beats one at equal specificity regardless of import order, so this is
robust even if the CSS files get reordered later. **If you add a tenth icon-affecting
leaf, or a sixth app whose icon class also happens to collide with its own screen's
CSS, use the same compound-selector pattern — don't revert to the bare class.**

## Adding a sixth phone-home theme

Add `resources/phone-themes/<id>/phone-theme.json` with `id`, `label`, `extends: "base"`
(or omit — same default), and a `tokens.phoneHome` block setting whichever of the
fourteen leaves you want to override (anything left unset derives from `basic`, falls
back to `base` for the twelve guaranteed leaves, or — for the two icon-coloring leaves
only — stays genuinely absent, preserving each app's own per-icon default). Nothing else
needs to change — the dev glob loader
(`phoneHomeThemeLibrary.browser.ts`) and the packaged dual-tier scanner
(`electron/phoneHomeThemeLibrary.cjs`) both discover it automatically, same as adding a
Studio `theme.json`.

## Packaged (Electron) support

The dual-tier packaged-mode loader is fully implemented, mirroring the Studio theme
engine's own `electron/themeLibrary.cjs` file-for-file:

- `electron/phoneHomeThemeLibrary.cjs` scans `resources/phone-themes/` (bundled,
  read-only) and `<userData>/phone-themes/` (user-authored, overrides a bundled theme of
  the same id), merges by id, and exposes `current()`/`reload()`/`openUserDirectory()`.
- `electron/main.cjs` instantiates the service at startup (`phoneHomeThemeLibraryReadyPromise`)
  and registers three IPC handlers: `phone-home-theme-library:get`,
  `phone-home-theme-library:reload`, `phone-home-theme-library:open-folder`, plus a
  `phone-home-theme-library:changed` broadcast on every window when a reload completes.
- `electron/preload.cjs` bridges these as `window.rpgraph.getPhoneHomeThemeLibrary`,
  `reloadPhoneHomeThemeLibrary`, `onPhoneHomeThemeLibraryChanged`,
  `openPhoneHomeThemeLibraryFolder`, typed in `src/electron.d.ts`.
- `phoneHomeThemeRegistry.ts`'s `usePhoneHomeThemeRegistry()` prefers the bridge when
  present (packaged) and falls back to `phoneHomeThemeLibrary.browser.ts`'s dev-mode
  glob loader when it isn't (`window.rpgraph` undefined) — identical fallback logic to
  `useThemeRegistry()`.

Nothing about the packaged path was stubbed or cut; a packaged build behaves exactly
like a Studio-theme packaged build, including a user-writable
`<userData>/phone-themes/` folder for hand-authored phone-home themes.
