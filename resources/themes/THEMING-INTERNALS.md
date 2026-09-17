# Theme engine — agent-facing notes

Architecture reference for whoever (human or AI) next touches theming. Read this before
adding tokens, migrating another CSS file onto the engine, or debugging a theme that
looks wrong. The user-facing `README.md` in this same folder is the "how do I write a
theme.json" guide — this file is "how does the machinery actually work, and what will
bite you if you're not careful."

## Where everything lives

| Piece | File |
|---|---|
| Token types, core token list, guaranteed-vs-optional split | `src/app/themeTokens.ts` |
| Color math for basic→advanced derivation (lighten/mix/contrast/alpha) | `src/app/themeColorMath.ts` |
| Pure resolution algorithm (extends chain, derivation, base fallback, flatten) | `src/app/themeResolver.ts` |
| Loads manifests (dev glob / packaged IPC), exposes picker helpers | `src/app/themeRegistry.ts` |
| Applies resolved tokens to the DOM (`element.style.setProperty`) | `src/app/useAppliedTheme.ts` |
| Browser/dev-mode loader (`import.meta.glob`), bundled tier only | `src/app/themeLibrary.browser.ts` |
| Packaged-mode loader: scans both tiers, merges by id | `electron/themeLibrary.cjs` |
| IPC registration (`theme-library:get/reload/open-folder`, `:changed` push) | `electron/main.cjs` |
| Bridge exposure (`getThemeLibrary`/`reloadThemeLibrary`/`onThemeLibraryChanged`/`openThemeLibraryFolder`) | `electron/preload.cjs`, typed in `src/electron.d.ts` |
| Bundled theme data (this folder) | `resources/themes/<id>/theme.json` |
| User-authored theme data (packaged mode only) | `<userData>/themes/<id>/theme.json` |
| One-shot literal-extraction CLI for migrating a CSS file onto the engine | `scripts/extract-raw-theme-tokens.mjs` |
| Consuming CSS | effectively every stylesheet under `src/` except the excluded ones (see below) |

Regression tests: `src/app/themeTokens.test.ts` (resolver correctness — derivation,
`base` fallback, category-collision, exercised against the real shipped `theme.json`
files), `src/app/studioTheme.test.ts` (registry-level: default id, bundled preset ids,
picker ordering), `src/app/themeExclusions.test.ts` (the phone-app/registration
exclusion boundary never gets a `--theme-*` reference — see below).

## The model, in one paragraph

A theme is a `theme.json` with an id, a label, an optional `extends` parent (defaults to
`"base"`), an optional `basic` tier (~7 simple knobs), and an open `tokens` tree (nested
dotted objects, e.g. `{"color": {"primary": "#fff"}}`). `resolveTheme(manifests, id)` in
`themeResolver.ts` walks the `extends` chain root-first, deep-merges the `tokens` trees
(child wins), fills any still-unset **guaranteed** token from a derivation rule or from
`base`, flattens every surviving key (guaranteed, optional, and any custom ones a theme
author invented) into `--theme-{kebab-case}` CSS variable names, and hands that flat map
to `useAppliedTheme`, which calls `element.style.setProperty` for each one on both the
`.studio` root element **and** `document.documentElement`. The second target exists
because some components (e.g. `NodeCustomSelect`'s dropdown) render via
`createPortal(..., document.body)`, which escapes the `.studio` subtree — custom
properties only inherit down the actual DOM tree, not through React's component tree, so
without writing to the document root a portaled element would never see a theme change.
No CSS file names a theme id in a selector — themes are pure data.

Manifests come from one of two loaders depending on environment: the Vite dev server
uses `themeLibrary.browser.ts`'s `import.meta.glob`, which can only see this folder's
bundled presets (no user-writable location exists outside Electron). The packaged app
uses IPC to `electron/themeLibrary.cjs`, which scans **two tiers** — this folder
(bundled, read-only) and `<userData>/themes` (user-authored) — and merges them by `id`,
user overriding bundled. This is the same dev/packaged split and `<userData>` pattern as
`electron/npcLibrary.cjs`'s NPC library, deliberately mirrored rather than invented
fresh. `createThemeLibraryService` caches the merged snapshot, serializes reloads
against concurrent calls, and exposes `openUserDirectory()` for a future "open my themes
folder" UI affordance — **the IPC/bridge plumbing for reload and open-folder exists
(`theme-library:reload`, `theme-library:open-folder`) but nothing in the UI calls them
yet**; today, a user dropping a `theme.json` into their user folder must restart the app
to see it, since only app startup triggers the initial `reload()`.

## The things that will bite you if you don't know them

**1. `base` feeds its *entire* tree into every theme's merge, not just the tokens that
theme is missing.** `buildChain` always puts `base` first in the chain, and the merge is
`for (const manifest of chain) advancedTree = deepMergeTree(advancedTree, manifest.tokens)`.
That means if `base.json` defines a value for some token, **every** theme that doesn't
explicitly override it inherits `base`'s value — even if that's semantically wrong for
that theme. This is fine and desired for genuinely universal defaults (`shape.borderStyle:
"solid"`, `effect.cardShadow: "none"`). It is a real bug for any token whose correct
per-theme fallback is *"this theme's own value of some other token"* rather than a fixed
constant. Two live examples of this exact trap, both already fixed correctly:

- `shape.radiusCard`/`radiusButton`/`radiusInput` should default to *that theme's own*
  `shape.radius`, not to a fixed constant. They're declared in `CORE_TOKEN_KEYS` (for
  autocomplete/typing) but have **no entry** in `base.json`'s `shape` object and are
  **not** in `GUARANTEED_TOKEN_KEYS`; the fallback is expressed purely in CSS instead:
  `border-radius: var(--theme-radius-card, var(--theme-radius));`.
- `graph.*`, `storybook.*`, and `app.*` should default to *that theme's own* `color.*`
  values (via `DERIVATION_RULES`, see below), not to a fixed constant. `base.json`
  deliberately has **no** `graph`/`storybook`/`app` blocks at all — if it did, that fixed
  value would permanently pre-empt derivation for every theme that doesn't explicitly
  override it, exactly the bug this split prevents. The "Classic" theme is the one
  exception that *does* pin all three explicitly (see `classic/theme.json`) — that's a
  theme's own `tokens` override, not a `base` default, so it only affects Classic.

One narrow exception that looks like the same trap but isn't: `effect.buttonBackground`'s
value in `base.json` is the *literal string* `"var(--theme-primary)"` — a CSS variable
reference, not a color. Every theme inheriting that string from `base` is safe, because
the browser re-resolves `var(--theme-primary)` against whatever `--theme-primary` that
specific element actually has at render time (which the resolver *does* set correctly
per-theme, since `color.primary` is a guaranteed token). If you want a token whose default
is "delegate to another theme-varying token," you can use this trick (`base` holds a
`var(...)` reference string) instead of the "leave it unset, rely on CSS fallback" pattern
above — both work, pick whichever reads more clearly for the case at hand.

**2. Don't assume one CSS "background-ish" name in your head maps to one token.** The
`color` category alone has nine distinct background/surface slots (`background`,
`backgroundElevated`, `header`, `surfaceRail`, `surfaceContent`, `panel`, `card`,
`cardStrong`, `input`) and they are genuinely different colors in every shipped theme —
`panel` and `card` in particular look like they could be the same slot and are not. If
you're migrating another CSS file onto this engine and you see two similarly-named
background variables, **check whether their actual hex values differ across themes
before collapsing them into one token.** If they do, keep them distinct.

**3. Wrapping a literal in `var(--theme-raw-x, literal)` does not make it theme-reactive
— only mapping it to a token with a `DERIVATION_RULES` entry (or an explicit per-theme
override) does.** The `raw.*` category (see below) exists specifically for values that
are *technically* CSS-variable-wired but deliberately left un-derived, and it's easy to
mistake "I wrapped it in a var()" for "I themed it." If a element still looks frozen
across theme switches after you've touched its CSS, check whether the token it now
references actually has a derivation rule or a real per-theme value — if it only has a
`raw.*` fallback, nothing will ever override it. This was the root cause behind several
rounds of "I already touched this file, why does it still look unthemed" during the
CSS migration — always verify by actually switching themes (or checking
`DERIVATION_RULES`), not just by grepping for `var(--theme-`.

**4. A blind find-and-replace across a stylesheet can rewrite a `:root` custom
property's own *definition* into a circular reference.** If a literal-substitution pass
turns every occurrence of, say, `#5fae68` into `var(--success, #5fae68)`, it will also
hit the line that *defines* `--success: #5fae68;` in `:root`, producing
`--success: var(--success, #5fae68);` — an invalid self-reference that breaks every
consumer of `--success` app-wide (the property computes to nothing). Any script or
search-and-replace that substitutes color literals for `var(...)` references must
exclude lines matching `^\s*--property-name:` (a custom property's own definition) from
the substitution. Run this check before committing any batch of literal substitutions:

```
grep -nE '^\s*--([a-zA-Z-]+):\s*[^;]*var\(--\1[,)]' src/styles.css src/styles/*.css
```

Any match is a self-reference bug — fix it by reverting that specific line to a plain
literal.

## Guaranteed vs. optional tokens

`GUARANTEED_TOKEN_KEYS` (in `themeTokens.ts`) is the subset the resolver force-fills from
`base` when nothing else supplies a value: the full `color.*` palette, every `shell.*`
key, `typography.fontWeight`, and `shape.radius`. These have no CSS-level fallback
anywhere they're consumed — the resolver is the only safety net, so `base.json` must
always have a value for every one of them (checked by `missingCoreTokensInBase` / the
"base theme alone... already satisfies every core token" test). Notably, `graph.*`,
`storybook.*`, and `app.*` are **not** guaranteed despite being core, heavily-used
tokens — see gotcha #1 above for why giving them a `base` value would be wrong.

Everything else in `CORE_TOKEN_KEYS` is optional: the resolver only fills it via a
derivation rule (see below) or leaves it genuinely absent, and the *consuming CSS* is
responsible for a sensible `var(--theme-x, fallback)`. When you add a new token, decide
which bucket it belongs in by asking: **is there a CSS-native fallback expression that
correctly reproduces "this theme didn't opt in" for every existing theme?** If yes
(`none`, `inherit`, `solid`, or `var(--theme-some-other-guaranteed-token)`), make it
optional and write that fallback into the CSS. If no (a color that has no sensible
universal default), make it guaranteed and put a real value in `base.json`.

## Derivation layer

`DERIVATION_RULES` in `themeResolver.ts` computes a token from either the `basic` tier
(`primary`, `secondary`, `background`, `foreground`, `headingFont`, `bodyFont`,
`radius` — for a future "configure your own theme" dialog) or from an already-resolved
`color.*` value (this is what makes `graph.*`/`storybook.*`/`app.*` repaint correctly
when a theme only customizes `color.*` — see gotcha #1). Rules run in `CORE_TOKEN_KEYS`
array order and may read already-resolved values from `resolved` — if you add a rule
with a dependency, make sure the dependency's own key appears **earlier** in
`CORE_TOKEN_KEYS`, or it'll still be `undefined` when your rule runs.

Color math (`themeColorMath.ts`) only parses `#hex` (3/6/8 digit) and `rgb()`/`rgba()` —
it does not understand `hsl()`, named colors (`"tomato"`), or CSS4 color functions. If a
theme's basic-tier or `color.*` value uses one of those, derivation silently produces
`undefined` for anything depending on it (which then falls through to `base` for
guaranteed tokens, or stays absent for optional ones — nothing crashes, it just won't
look as intended). Extend `parseColor` if this becomes a real need.

## Naming convention

JSON source: nested dotted objects, `category.propertyName` (camelCase leaf), e.g.
`color.primaryForeground`, `graph.lineSoft`, `shape.radiusCard`. `dottedPathToCssVar` in
`themeResolver.ts` compiles this into the CSS variable name, but **not uniformly** —
only the five original categories (`color`, `typography`, `shape`, `effect`, `motion`)
have their category segment dropped from the name: `color.primaryForeground` →
`--theme-primary-foreground`, `shape.radiusCard` → `--theme-radius-card`. Every category
added since (`graph`, `storybook`, `shell`, `app`, `raw`) **keeps** its segment:
`graph.panel` → `--theme-graph-panel`, `app.line` → `--theme-app-line`. This split
(`CATEGORIES_DROPPED_FROM_VAR_NAME` in `themeResolver.ts`) exists because dropping the
segment for every category would collide same-named leaves across categories —
`graph.panel` and `color.panel` would otherwise both compile to `--theme-panel`. If you
introduce a brand-new category, keep its segment in the name (i.e. don't add it to
`CATEGORIES_DROPPED_FROM_VAR_NAME`) unless you've checked it shares no leaf names with
an existing category.

**Tokens can hold complete CSS values, not just scalars** — a gradient, a `clip-path`
polygon, a full `box-shadow`, a `var(...)` reference. There is no `{value, unit}`
tagging; every leaf is a plain string, matched 1:1 to what you'd write in a stylesheet.

## The `raw.*` category

`raw.*` holds auto-extracted, one-off color literals that were wrapped in
`var(--theme-raw-<slug>, <original-literal>)` by `scripts/extract-raw-theme-tokens.mjs`
during a CSS migration pass, where `<slug>` is the literal's own characters (e.g.
`raw.vedf1ff` for `#edf1ff`), not a hand-picked semantic name. These tokens are
**intentionally never given a value anywhere** — no theme sets them, `base.json` doesn't
either — so the literal baked into the `var(..., fallback)` is what always renders. This
is the correct outcome for genuinely decorative, one-off accents (a drop shadow, a
glassy highlight, a five-color rotation that's supposed to look different per item) that
don't belong to any shared semantic slot. It is the *wrong* outcome if the value should
actually track the active theme — see gotcha #3 above. When migrating a file, prefer
mapping a literal onto an existing semantic token (`app.line`, `graph.muted`, a
`color-mix(in srgb, var(--success) calc(N * 100%), transparent)` for a translucent
variant of an existing token, etc.) over leaving it in `raw.*`; reach for `raw.*` only
once you've confirmed the value genuinely doesn't correspond to any shared role.

## Adding a new theme

1. `resources/themes/<id>/theme.json` (bundled) or `<userData>/themes/<id>/theme.json`
   (user-authored, packaged builds only) — id, label, `"extends": "base"`, an `order`
   integer if it should sit at a specific spot in the picker (omitted = sorts last,
   alphabetically among other order-less themes), and only the `tokens` you actually
   want to differ from `base`. You almost never need to restate a token whose value
   should just be `base`'s or derived from your own `color.*`.
2. Nothing else. No code change, no registration list, no rebuild step beyond the normal
   dev server picking up the new file via `import.meta.glob` (dev) or the next packaged
   build's `electron-builder.yml` `extraResources` copy (already configured to include
   all of `resources/themes`) plus a user restart for the user tier (see "reload has no
   UI trigger yet" above).
3. Run `npx vitest run src/app/themeTokens.test.ts src/app/studioTheme.test.ts` — the
   first file's "every shipped theme resolves every guaranteed token" test will catch a
   theme that's missing something it needs. `studioTheme.test.ts`'s bundled-id assertion
   uses `arrayContaining`, so adding a new theme doesn't require updating it.

## Adding a new token category / migrating another CSS file onto this engine

This system was deliberately built to make that additive, not a resolver change:

1. Add the dotted key to `CORE_TOKEN_KEYS` in `themeTokens.ts` (and to
   `GUARANTEED_TOKEN_KEYS` too, *only* if it has no sensible CSS-level fallback — see
   the guaranteed-vs-optional discussion above). If it's a brand-new category, keep its
   segment in the compiled var name (see the naming-convention collision note above)
   unless you've verified no leaf-name collision.
2. Give it a value in `base.json` (always, for guaranteed tokens; only if the token's
   universal default is genuinely universal, for optional ones — re-read gotcha #1
   before doing this for anything radius/size-like or anything that should track the
   theme's own `color.*` instead of a fixed constant).
3. Write the *consuming* CSS rule referencing `var(--theme-your-new-token, ...)`, in
   whichever file you're migrating. Do not add per-theme-id selectors
   (`[data-studio-theme="x"]`) for anything expressible as a token — that's the exact
   pattern this system replaced. `scripts/extract-raw-theme-tokens.mjs` (`analyze`/`apply`
   modes) can bulk-discover and wrap repeated literals in a file as a starting point —
   but its output is `raw.*` by default (see above); manually re-map anything that
   should actually be theme-reactive onto a real semantic token afterward, and never
   let it touch a `:root` property's own definition (gotcha #4).
4. Only then, optionally, add per-theme overrides to individual `theme.json` files.

You do not need to touch `themeResolver.ts`, `themeRegistry.ts`, `useAppliedTheme.ts`, or
any Electron loader file for this — they're already fully generic over the token
dictionary's shape.

## The exclusion boundary

Simulated phone apps and their registration/profile screens are hand-recreated
pixel-for-pixel from real prototypes and must never be retheme'd — their visual
identity is the point. The boundary is enforced by selector prefix, not by file:
any CSS rule whose selector matches `.phone-`, `.pt-`, or `.social-profile-` is out of
scope, in *any* stylesheet, including ones that otherwise mix in-scope and out-of-scope
rules (e.g. `phone-device.css` holds both the excluded `.phone-*` simulated content and
the in-scope `.roleplay-phone-*` device bezel/casing — the bezel is chrome, not
handcrafted content, so it *is* themed).

`src/app/themeExclusions.test.ts` enforces this two ways: a flat "never contains
`--theme-`" check for stylesheets that are excluded in their entirety
(`phone-widgets.css`, `phoneDating.css`), and a brace-depth-tracking scan for files that
legitimately mix both (`phone-device.css`, `src/styles.css`) — it walks selector text
per nested block and flags any `--theme-` reference found inside a block whose selector
matched the exclusion regex. Run this test after any bulk literal-substitution pass
across `src/styles.css` — a broad regex substitution can accidentally leak a
`var(--theme-...)` into an excluded block just as easily as it can hit a `:root`
definition (gotcha #4).

## Known non-goals (don't try to route around these here)

- **Component-render-logic personality** (conditional JSX per theme, e.g. swapping
  numbering schemes) is not expressible through CSS custom properties. A theme can only
  ever change appearance, never markup or logic.
- **Per-character theming** — no hook exists anywhere in this system for it (deliberately;
  it's a separate, unstarted future task).
- **The Graph-mode canvas's own background** (behind the nodes, painted by the xyflow
  library itself) is not themeable — xyflow paints an opaque background over anything
  CSS tries to put behind it, so this is a library limitation, not a missing token.
  Everything else in Graph mode (sidebars, panels, node cards, HUD chrome, connection
  lines) *is* themed via `graph.*`. Don't re-attempt making `.react-flow`'s own
  background transparent; it's been tried and doesn't work.
- **`src/styles.css`** (the ~25k-line upstream-shared file) is edited in place by this
  system's ongoing migration and is in fact its single largest consumer of `--theme-*`
  tokens today. It is deliberately **never split into smaller per-feature files** by
  this work — that refactor is real but explicitly deferred to a final phase, so that
  the fork stays diffable against upstream while the token migration is in progress.
  Editing values in place, not moving/extracting rules elsewhere, is the standing rule
  for this file until that phase begins.
- **A visual, in-app theme editor** (pick colors with a UI instead of hand-editing JSON)
  is planned but does not exist yet. `ThemeManifest.basic` and the derivation layer
  exist specifically to support one eventually — a future editor would only need to
  write out the ~7 `basic` fields and let derivation fill in the rest.
