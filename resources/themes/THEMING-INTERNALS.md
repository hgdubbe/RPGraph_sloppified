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
| The phone's own OS-chrome theme — a second, independent manifest-driven engine, see below and `resources/themes/PHONE-HOME-THEME-INTERNALS.md` | `src/app/phoneHomeTheme{Tokens,Resolver,Registry}.ts`, `resources/phone-themes/<id>/phone-theme.json` |
| Browser/dev-mode loader (`import.meta.glob`), bundled tier only | `src/app/themeLibrary.browser.ts` |
| Packaged-mode loader: scans both tiers, merges by id | `electron/themeLibrary.cjs` |
| IPC registration (`theme-library:get/reload/open-folder`, `:changed` push) | `electron/main.cjs` |
| Bridge exposure (`getThemeLibrary`/`reloadThemeLibrary`/`onThemeLibraryChanged`/`openThemeLibraryFolder`) | `electron/preload.cjs`, typed in `src/electron.d.ts` |
| Bundled theme data (this folder) | `resources/themes/<id>/theme.json` |
| User-authored theme data (packaged mode only) | `<userData>/themes/<id>/theme.json` |
| One-shot literal-extraction CLI for migrating a CSS file onto the engine | `scripts/extract-raw-theme-tokens.mjs` |
| Consuming CSS | effectively every stylesheet under `src/` except the excluded ones (see below) |
| Independently-themable phone-app screens (their own token namespace, see below) | `src/styles/phone-{notes,chatgpd,banking,gallery,social}.css` |
| Independently-themable phone home screen/dock (`phoneHome.*`, see below) | `src/styles/phone-widgets.css` |

Regression tests: `src/app/themeTokens.test.ts` (resolver correctness — derivation,
`base` fallback, category-collision, exercised against the real shipped `theme.json`
files), `src/app/studioTheme.test.ts` (registry-level: default id, bundled preset ids,
picker ordering), `src/app/themeExclusions.test.ts` (the hand-crafted registration/
signup-form content never gets a *shared-palette* `--theme-*` reference — see below;
this does not cover the independently-themed phone-app screens, which are a separate,
deliberate exception).

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

## Independent per-app tokens (`phoneNotes.*`, `phoneChatgpd.*`, `phoneBanking.*`, `phoneGallery.*`, `phoneSocial.*`, `phoneHome.*`)

A third kind of token category, distinct from both the guaranteed/derived tier
(`color.*`, `graph.*`, `storybook.*`, `app.*`, `shell.*`) and `raw.*`. These back the
five simulated phone-app screens, each split into its own file under `src/styles/`
(`phone-notes.css`, `phone-chatgpd.css`, `phone-banking.css`, `phone-gallery.css`,
`phone-social.css`) — plus a sixth, `phoneHome.*`, added later for the phone's own
home screen/launcher (icon grid, clock, widgets, favorites dock) and living in
`phone-widgets.css` instead of a same-named file (see the note at the end of this
section for why). Like `raw.*`, they have **no `base.json` entry and no
`DERIVATION_RULES` entry** — a theme that doesn't explicitly set one gets that app's
own fixed default look, not something derived from `color.*`. Unlike `raw.*`, their
names are hand-picked and meaningful (`phoneBanking.accent`, not `raw.v3b82f6`),
because the point is for a theme author to be able to deliberately retint one specific
phone app — each app is meant to be themable **independently of the rest of the UI and
of the other phone apps**, the same way a real phone's individual apps each have their
own brand identity rather than inheriting the OS chrome's accent color.

`phone-social.css` is the one wrinkle: it renders both the Fotogram and OnlyFriends
apps through a single component, switching brand via a runtime class
(`.phone-social-theme-onlyfriends`) that overrides a handful of *local* CSS custom
properties (`--social-accent`, `--social-screen-bg`, etc.) the rest of the file
consumes. Structural chrome shared by both brands (panels, borders, muted text) uses
plain `phoneSocial.*` tokens; each brand's own accent/background/card colors get their
own `phoneSocial.fotogram*`/`phoneSocial.onlyfriends*`-prefixed tokens, so the two
brands can be retinted independently of each other, not just independently of the main
app. `phone-notes.css` has a similar wrinkle: its 8 sticky-note colors
(`phoneNotes.tintNeutral`, `tintSand`, `tintCoral`, ...) are each their own token
holding a bare `R, G, B` triplet (not a full color), consumed via
`rgba(var(--note-tint), alpha)` — collapsing them into one shared accent would defeat
the point of having 8 distinct note colors to choose from.

**This does not violate the exclusion boundary below.** `.phone-notes-*`,
`.phone-chatgpd-*`, `.phone-banking-*`, `.phone-gallery-*`, and
`.phone-social-*`/`.phone-fotogram-*`/`.phone-onlyfriends-*` all match the `.phone-`
exclusion prefix, but that boundary protects *hand-crafted, pixel-matched* content
(registration/signup forms, the phone's simulated OS chrome) — these five files are the
fork's own functional in-roleplay phone apps, which are supposed to be reskinnable,
just through their own namespace instead of the shared `app.*` palette. None of these
five files are in `themeExclusions.test.ts`'s `EXCLUDED_STYLESHEETS`/`MIXED_STYLESHEETS`
lists, which is what actually keeps that test from flagging their `--theme-*`
references — if you add another independently-themed phone screen, follow the same
pattern (own token prefix, not in either exclusion list) rather than adding it to an
already-excluded file.

**`phoneHome.*` bends that "own file" rule, deliberately.** The home screen's
*unthemed* markup — `.phone-desktop`, the icon grid, the clock, the app-icon buttons —
isn't split out into its own file the way the five apps above are: it's split across
upstream-shared `src/styles.css` (bulk of `.phone-desktop*`) and the fork-owned
`phone-device.css` (bezel-adjacent bits), both of which are `MIXED_STYLESHEETS` entries
whose brace-depth scan forbids *any* `--theme-` reference inside a block matching the
`.phone-` exclusion prefix, full stop — there's no "but this one has its own namespace"
carve-out at that scan's granularity, unlike the flat per-file check used for fully
excluded files. So every `phoneHome.*`-driven declaration, including ones that override
a rule whose unthemed base lives in one of those two files, was collected into
`phone-widgets.css` instead (a same-name `phone-home.css` would still have needed this,
since the *unthemed* rules were staying in place per the "don't move fork content out
of upstream-shared files" convention below) — cascade order in `src/styles/index.css`
puts `phone-widgets.css` after both source files, so same-specificity declarations
there win. `phone-widgets.css` was previously one of the fully-excluded
`EXCLUDED_STYLESHEETS` entries (nothing themeable used to live there); it was removed
from that list specifically to allow `phoneHome.*` to live there. If you add a seventh
independently-themed phone surface whose unthemed markup is *also* stuck inside a
`MIXED_STYLESHEETS` file, this is the pattern to repeat — don't add your new file to
either exclusion list, and don't try to theme the block in place.

## The phone's own OS-chrome theme is a third, completely separate system

There are three independent theming systems in this app, not two — don't conflate them:

1. **The Studio theme** — `theme.json`/`themeResolver.ts`/`themeRegistry.ts`, selected in
   the main menu ("Theme"), covers Play mode, Graph mode, Storybook, dialogs.
2. **The in-phone-app themes** — the `phoneNotes`/`phoneChatgpd`/`phoneBanking`/
   `phoneGallery`/`phoneSocial`/`phoneHome` token blocks documented above. Still
   `theme.json`-authored, still resolved by the same engine, just their own independent
   namespace within it (a theme author can set these in any theme's `tokens`).
3. **The phone's own OS-chrome theme** — its own "Theme" control, in the phone's own
   settings tray. This is now its own **second, fully independent manifest-driven theme
   engine** — same architecture as system 1 (its own token types, resolver, registry,
   bundled+user dual-tier Electron loader, DOM-application hook), scoped one level down
   to just the phone's home screen. See `resources/themes/PHONE-HOME-THEME-INTERNALS.md`
   for the full writeup. It covers exactly what `phoneHome.*` (system 2) covers
   visually — wallpaper scrim, clock widget, desktop widgets, app-icon labels,
   notification badges, the mood-status dot, the bottom dock — but through a completely
   separate mechanism (its own `resources/phone-themes/<id>/phone-theme.json` manifests,
   not `theme.json`), and it is what actually backs the phone's own "Theme" picker;
   system 2's `phoneHome.*` remains available for anyone hand-authoring a `theme.json`
   who wants that route instead, but nothing wires the two together.

Both engine 1 and engine 3 compile to the same custom property *names*
(`--theme-phone-home-scrim`, `--theme-phone-home-accent`, etc.) that
`phone-widgets.css`'s home-screen rules already consume — this is a reuse of
vocabulary, not a merge of mechanisms, and it means `phone-widgets.css` needed zero
edits for engine 3 either. The critical isolation property engine 3 preserves: its
`useAppliedPhoneHomeTheme` hook (mirroring engine 1's `useAppliedTheme`) writes
`element.style.setProperty` **only** onto the `.roleplay-phone-device` element it's
given a ref to — deliberately never onto `document.documentElement` the way engine 1's
hook does (engine 1 needs that second write to reach portaled dropdowns that escape its
own root's subtree; `.roleplay-phone-device` doesn't have that problem, since its own
portaled tray menus render as literal DOM descendants of it rather than via
`createPortal(..., document.body)`). Writing to `document.documentElement` from engine 3
would leak the phone's theme choice back out to the rest of the Studio and defeat the
entire point of keeping this system separate — never add that write if you touch this
engine.

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

Hand-crafted, pixel-matched content — registration/signup forms and the phone's
simulated OS chrome — must never be retheme'd via the shared palette; their visual
identity is the point. The boundary is enforced by selector prefix, not by file: any
CSS rule whose selector matches `.phone-`, `.pt-`, or `.social-profile-` is out of
scope for the shared `color.*`/`app.*`/etc. palette, in *any* stylesheet, including
ones that otherwise mix in-scope and out-of-scope rules.

The phone's own hardware chrome — the `.roleplay-phone-device` bezel/casing,
`.roleplay-phone-status` bar, `.roleplay-phone-home` button, `.roleplay-phone-stage`
and `.roleplay-phone-overlay-layer` — is excluded too, in `phone-device.css` and
`src/styles/roleplay-dual-pane.css`, even though none of those selectors start with
`.phone-`. This used to be the one deliberate gap in the boundary (an earlier version
of this document said "the bezel is chrome, not handcrafted content, so it *is*
themed"): the phone is meant to be its own product surface end to end, hardware
included, never inheriting the Studio theme just because its casing happens to be
CSS-drawn rather than a hand-placed asset. `EXCLUDE_SELECTOR_RE` in
`themeExclusions.test.ts` matches every `.roleplay-phone-` selector except
`.roleplay-phone-screen` itself — that one is the boundary's *reset mechanism* (see
below), not chrome, so excluding it would make the scanner flag its own legitimate
`--theme-*: var(--phone-ui-*)` definitions as violations.

The five phone-app screens (`phone-notes.css`, `phone-chatgpd.css`,
`phone-banking.css`, `phone-gallery.css`, `phone-social.css`), plus `phone-widgets.css`
for `phoneHome.*`, are a deliberate, narrow exception: their selectors also match the
`.phone-` prefix, but they're wired to their *own* independent token namespace instead
of the shared palette (see above) — that's a different, additive mechanism, not a
breach of this boundary. The test below doesn't actually distinguish "own namespace"
from "shared palette" by content — it's a plain `--theme-` substring check — so what
keeps it from flagging these files is simply that **they are not listed** in
`EXCLUDED_STYLESHEETS`/`MIXED_STYLESHEETS` below; the test never inspects them at all.
(`phone-widgets.css` used to be in `EXCLUDED_STYLESHEETS` back when nothing themeable
lived there — it was removed from that list when `phoneHome.*` was added.) If one of
these files were ever added to either list by mistake, the test would immediately fail
on its own legitimate `--theme-phone-{app}-*`/`--theme-phone-home-*` references — that
failure means "remove it from the exclusion list," not "strip the theming back out."

`src/app/themeExclusions.test.ts` enforces this two ways: a flat "never contains
`--theme-`" check for stylesheets that are excluded in their entirety
(currently just `phoneDating.css` — `phone-widgets.css` was removed from this list when
`phoneHome.*` was added, see above), and a brace-depth-tracking scan for files that
legitimately mix both (`phone-device.css`, `src/styles/roleplay-dual-pane.css`,
`src/styles.css`) — it walks selector text
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
  tokens today. It is **not** split into smaller per-feature files wholesale, and won't
  be — upstream keeps editing this file as one, so restructuring it would make every
  future upstream merge a manual re-mapping exercise for no fork-specific-content gain.
  The one exception: rules that are **100% fork-authored with zero upstream
  counterpart** (verified by diffing against `upstream/main`'s own `styles.css` before
  moving anything) can be extracted, since upstream has nothing there to conflict with
  — this is how the five phone-app screens above ended up in their own files. When
  extracting, use a brace-depth-aware script and verify byte-for-byte parity (matching
  `{`/`}` counts between the original and the combined output) before deleting anything
  from the original, the same way that extraction was verified. Anything that exists
  upstream too, even if this fork has since added `var(--theme-*, ...)` wrapping to it,
  stays at its current path in `styles.css` — the token wrapping doesn't make it
  fork-owned for file-organization purposes.
- **A visual, in-app theme editor** (pick colors with a UI instead of hand-editing JSON)
  is planned but does not exist yet. `ThemeManifest.basic` and the derivation layer
  exist specifically to support one eventually — a future editor would only need to
  write out the ~7 `basic` fields and let derivation fill in the rest.
