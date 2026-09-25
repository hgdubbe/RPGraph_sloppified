# RPGraph Phone Theme Capability Map

Use this as a repository-grounded starting point, not a timeless schema. Verify drift-sensitive details in the current checkout before interviewing or writing a phone token block.

## Evidence to inspect

| Concern | Primary evidence |
| --- | --- |
| Registered token keys (five apps) | `src/app/themeTokens.ts` — search `phoneNotes`, `phoneChatgpd`, `phoneBanking`, `phoneGallery`, `phoneSocial` |
| Home screen tokens (not registered — see gap below) | `src/styles/phone-widgets.css`, search `--theme-phone-home-` |
| What each app actually renders | `src/components/PhonePanel.tsx` |
| Consuming CSS per app | `src/styles/phone-notes.css`, `phone-chatgpd.css`, `phone-banking.css`, `phone-gallery.css`, `phone-social.css`, `phone-widgets.css` |
| Home screen/device chrome CSS (mostly *not* themeable — see boundary below) | `src/styles.css` (search `.phone-desktop`), `src/styles/phone-device.css` |
| Author guidance | `resources/themes/README.md`, section "Independent simulated phone apps" |
| Engine behavior, the exclusion boundary, and the `phoneHome` exception | `resources/themes/THEMING-INTERNALS.md`, sections "Independent per-app tokens" and "The exclusion boundary" |
| Regression checks | `src/app/themeExclusions.test.ts` (enforces the exclusion boundary), `src/app/themeTokens.test.ts` (does **not** currently cover `phoneHome` — see gap below) |
| The phone's own separate "Theme" picker (out of this skill's scope — see below) | `src/app/phoneHomeTheme{Tokens,Resolver,Registry}.ts`, `resources/phone-themes/<id>/phone-theme.json`, `resources/themes/PHONE-HOME-THEME-INTERNALS.md`, `resources/themes/THEMING-INTERNALS.md` section "The phone's own OS-chrome theme is a third, completely separate system" |
| Existing examples | `neon-social` and `kawaii-dream` set a `phoneHome` block (this skill's namespace); no shipped theme sets the other five yet |

## Verified model in this repository state

- Six phone-app surfaces have their own token namespace, independent of the main Studio `color.*` palette and of each other: `phoneNotes`, `phoneChatgpd`, `phoneBanking`, `phoneGallery`, `phoneSocial` (backing the five functional in-roleplay phone apps), and `phoneHome` (the phone's own home screen/launcher: wallpaper scrim, clock widget, app icon grid, desktop widgets, notification badges, and the bottom favorites dock).
- **This skill's six namespaces are `theme.json`-authored and are a different system from the phone's own "Theme" picker in its settings tray.** That picker is backed by its own, fully independent manifest-driven engine — `phone-theme.json` files under `resources/phone-themes/<id>/`, resolved by `src/app/phoneHomeThemeResolver.ts` and loaded by `src/app/phoneHomeThemeRegistry.ts` — deliberately mirroring this skill's `theme.json`/`themeResolver.ts`/`themeRegistry.ts` architecture one level down in scope, but a completely separate set of files with its own manifest format (see `resources/themes/PHONE-HOME-THEME-INTERNALS.md`). It covers the same visual ground as `phoneHome.*` (wallpaper scrim, clock, widgets, badges, dock) *plus two axes `phoneHome.*` cannot touch at all: shape and icon coloring* (see the next bullet) — through that separate engine. If a user asks to change what that in-app picker shows, that is **not** a `phoneHome.*` edit and is outside this skill's scope; point them at `resources/phone-themes/<id>/phone-theme.json` instead of writing a `theme.json` block that picker will never read. This skill's `phoneHome.*` (and the other five) remain fully real and useful for anyone hand-authoring a `theme.json` — they're just a separate route to a related-looking result, not the one wired to that specific control.
- **The sibling engine's leaf set is a strict superset of what `phoneHome.*` here can express.** It has the same 10 color leaves (`scrim`/`accent`/`accentStrong`/`clockBackground`/`clockText`/`widgetBackground`/`label`/`badge`/`badgeBanking`/`online`) *plus* `iconRadius`/`cardRadius` (shape — corner geometry for the icon grid and the clock/widget/dock cards) and `iconBackground`/`iconBorder` (icon coloring — set both to flatten all nine app icons to one background/border, e.g. for a monochrome look; leave both unset, the default, to keep each app's own hand-picked icon color). A request like "I want a monochromatic sharp-cornered phone theme" is **only** answerable through this sibling engine (`iconRadius`/`cardRadius` sharp + `iconBackground`/`iconBorder` set) — `phoneHome.*` in this skill's own scope has no shape or icon-coloring leaves at all and never will (see the leaf table below, unchanged). Route that request to `resources/phone-themes/<id>/phone-theme.json`, not here. The shipped `mono` theme (`resources/phone-themes/mono/phone-theme.json`) is a working example of exactly this combination.
- None of the six have a `base.json` entry and none have a `DERIVATION_RULES` entry. A theme that sets nothing in one of these blocks gets that surface's hand-authored, fixed default look — not something derived from `color.primary` or any other Studio token. This is the entire point: changing the Studio accent must never unexpectedly repaint an in-world banking app.
- Every consuming CSS declaration for these namespaces is written `var(--theme-phone-<app>-<leaf>, <literal fallback>)`. The literal fallback is the shipped, unthemed look, so an author only needs to set the leaves they actually want to change.
- Naming: dotted JSON key `phoneBanking.accentStrong` compiles to CSS variable `--theme-phone-banking-accent-strong`. Unlike the five original categories (`color`, `typography`, `shape`, `effect`, `motion`), every phone-app category **keeps** its own segment in the compiled name — there is no risk of `phoneBanking.accent` colliding with `phoneSocial.accent` or `color.accent`.

## Verified gap: `phoneHome` is not registered like its five siblings

`phoneNotes`, `phoneChatgpd`, `phoneBanking`, `phoneGallery`, and `phoneSocial` are all listed in `CORE_TOKEN_KEYS` in `src/app/themeTokens.ts`. `phoneHome` is **not** — it was added later directly as CSS `var(--theme-phone-home-*, ...)` references without a matching `CORE_TOKEN_KEYS` entry. It still works: any nested string under `tokens` in a `theme.json`, registered or not, gets flattened into a `--theme-*` custom property and applied to the DOM (this is documented as intentionally forward-compatible engine behavior, not a bug). Practical consequences to tell the user, not silently patch:

- Editor/IDE tooling or any future authoring UI that autocompletes from `CORE_TOKEN_KEYS` will not suggest `phoneHome.*` leaves.
- `src/app/themeTokens.test.ts`'s "every shipped theme resolves every guaranteed/registered token" style of check does not exercise `phoneHome` the way it exercises the other five.
- If asked to "fix" this, that is a source change to `themeTokens.ts` outside this skill's scope (it edits `theme.json` files, not the engine) — name it and, if the user wants it done, hand off rather than doing it silently inside a theming task.

## Capability groups (the six namespaces)

| Namespace | Registered in `CORE_TOKEN_KEYS`? | Leaves | Notable behavior |
| --- | --- | --- | --- |
| `phoneHome.*` | No (see gap above) | `scrim`, `accent`, `accentStrong`, `clockBackground`, `clockText`, `widgetBackground`, `label`, `badge`, `badgeBanking`, `online` | Backs the home screen's wallpaper scrim, clock widget, desktop widgets (including the narrative widget), app-icon label color, notification badges, mood-status dot, and the bottom favorites dock. The dock is not a separate token consumer — it reuses `widgetBackground` and `accent`. |
| `phoneNotes.*` | Yes | `background`, `text`, `textStrong`, `accent`, `accentLight`, `accentStrong`, `accentDeep`, `danger`, plus 8 sticky-note tints | The 8 tints (`tintNeutral`, `tintSand`, `tintCoral`, `tintPeach`, `tintMint`, `tintSky`, `tintLavender`, `tintRose`) are each a **bare `R, G, B` triplet string** (e.g. `"224, 193, 139"`), not a full CSS color — consumed as `rgba(var(--note-tint), alpha)`. This is the one namespace where the value *format* itself is unusual; do not author these as `#hex` or `rgb(...)`. |
| `phoneChatgpd.*` | Yes | `background`, `panelStrong`, `glass`, `text`, `textStrong`, `textOnAccent`, `accent`, `accentLight`, `accentDeep`, `accentBright`, `danger` | Single palette, no sub-brand split. |
| `phoneBanking.*` | Yes | `background`, `panel`, `line`, `text`, `textStrong`, `muted`, `accent`, `accentStrong`, `accentDeep`, `success`, `danger` | Single palette; `phoneHome.badgeBanking` (a *different*, `phoneHome`-namespaced token) separately colors this app's home-screen notification badge — don't confuse the two when a user asks to recolor "the banking badge." |
| `phoneGallery.*` | Yes | `background`, `panel`, `stage`, `line`, `text`, `textStrong`, `muted`, `badge`, `success`, `danger` | Single palette. |
| `phoneSocial.*` | Yes | Shared: `background`, `panel`, `panelAlt`, `panelDeep`, `bubbleIncoming`, `glass`, `line`, `text`, `textStrong`, `muted`, `tip`, `tipText`, `success`, `danger`, `dangerBg`. Per-brand: `fotogramAccent`, `fotogramAccentStrong`, `fotogramCard`, `onlyfriendsAccent`, `onlyfriendsAccentStrong`, `onlyfriendsGlow`, `onlyfriendsBackground`, `onlyfriendsCard`, `onlyfriendsBubbleIncoming` | **One namespace renders two distinct in-world apps** (Fotogram and OnlyFriends) through a single component. Structural chrome (panels, borders, muted text) is shared via the plain `phoneSocial.*` leaves; each brand's own accent/background/card gets its own `fotogram*`/`onlyfriends*`-prefixed leaf so the two brands can be retinted independently of each other, not just independently of the rest of the app. If a user wants "the social apps" restyled, ask which brand(s), or you will end up guessing which prefix set they meant. |

Read the exact current leaf lists directly from `src/app/themeTokens.ts` (for the five registered namespaces) and `src/styles/phone-widgets.css`'s `--theme-phone-home-*` references (for `phoneHome`) before writing a specification — this table is a snapshot, not a substitute for that check.

## The exclusion boundary, and why these six namespaces are the exception to it

`resources/themes/THEMING-INTERNALS.md`'s "exclusion boundary" keeps hand-crafted, pixel-matched content — the phone's simulated OS chrome, registration/signup forms — outside the shared Studio palette entirely; any CSS selector matching `.phone-`, `.pt-`, or `.social-profile-` is forbidden from referencing a shared `--theme-*` variable, enforced by `src/app/themeExclusions.test.ts`. The six namespaces in this skill's scope are a **deliberate, narrow exception to that boundary**, not a violation of it: their selectors also match `.phone-`, but every themed declaration routes through their own independent namespace (`--theme-phone-<app>-*`) instead of the shared palette, and their five/six files (`phone-notes.css`, `phone-chatgpd.css`, `phone-banking.css`, `phone-gallery.css`, `phone-social.css`, `phone-widgets.css`) are specifically **not** listed in that test's `EXCLUDED_STYLESHEETS`/`MIXED_STYLESHEETS`.

Practical effect for this skill: you can retint everything consumed by those six namespaces freely. You cannot make the phone's device bezel, status bar, home button, or any other `.phone-*`/`.roleplay-phone-*` chrome follow one of these namespaces (or the shared Studio palette) if it isn't already wired to one — that would require a source change (adding a new `var(--theme-phone-<x>-...)` reference to CSS that doesn't have one yet), which is outside this skill's scope; name it as a limitation rather than attempting it mid-theming-task. The `.roleplay-phone-device` bezel/casing, `.roleplay-phone-status` bar, and `.roleplay-phone-home` button are hardware chrome, deliberately excluded from *every* palette — shared and phone-namespaced alike — so they render identically under any theme and any of these six blocks; they are not this skill's or the general skill's to retint, full stop. Only `.roleplay-phone-screen`'s device *bezel-adjacent* content (the wallpaper/scrim/icon-grid area rendered inside the screen) is themeable, and only through `phoneHome.*` in this skill's scope — never through the shared palette either.

## Inheritance and color constraints

- Because none of the six namespaces have a `base.json` entry, `extends` inheritance behaves simply here: a child theme either sets a leaf explicitly or gets that app's hardcoded shipped default, full stop. There is no derivation layer to reason about for these namespaces (contrast this with `graph.*`/`storybook.*`/`app.*`, which do derive from `color.*` in the general skill's scope).
- `phoneNotes`'s tint leaves are the one place in the entire token system where the value is a bare `R, G, B` triplet rather than a complete color — get this wrong and the note tint renders as `rgba(undefined, undefined, undefined, alpha)` (invisible/black), not a visible error.
- Prefer parseable, literal color values (hex or `rgb()`/`rgba()`) for every leaf in these namespaces; none of them feed the resolver's basic-tier color-math derivation, but staying parseable keeps values easy to preview and adjust by hand.

## Verified limitations and exclusions

- These namespaces alter appearance only. They cannot change which apps exist, their layout, navigation, or behavior (e.g. you cannot add a "sixth" fake conversation via theming, or resize the icon grid).
- `phoneHome` cannot add new dock apps, resize the icon grid, or add new widgets — it retints what's already there (icons, clock, widgets, badges, the four fixed dock apps). Layout/feature changes are a `PhonePanel.tsx` change, outside this skill.
- The Graph-mode canvas, Play-mode shell, and Storybook are entirely outside these six namespaces' reach — use the general `rpgraph-theme-designer-skill` for those.
- A theme can set existing font stacks in the general Studio typography tokens, but none of these six phone namespaces expose their own typography leaves — phone-app text follows each app's fixed CSS font choices regardless of theme.
- Unknown/custom leaves under any of these six keys will load and flatten to a CSS variable but remain inert unless a real CSS consumer already references that exact variable name. Never describe loader permissiveness as a theme capability — verify the consumer exists in the relevant `phone-*.css` file first.

## Capability-map discipline

For each requested visual feature, record one row:

| Status | User intent | Concrete phone-namespace mapping | Evidence | Preview/validation |
| --- | --- | --- | --- | --- |
| Verified capability / limitation / inference / unknown | What the user wants | Exact dotted key (e.g. `phoneBanking.accent`) or closest supported interpretation | Current file and relevant symbol/section | How the concept and real file will be checked |

Reclassify inferences and unknowns after inspection. Put unresolved items in the final specification rather than silently filling them with generic web-design assumptions.
