# Themes

This folder holds the built-in themes for RPGraph Studio's whole UI shell — Play mode
(chat/phone), Graph mode's workflow canvas, the Storybook editor, and every dialog/menu
in between (Options, Providers, System Log, NPC Library, Turn Trace, and so on).

A theme is one file: `theme.json`. No code changes, no rebuild step. Bundled themes
(this folder) ship with the app; you can also drop your own `theme.json` into a
per-user folder and it appears in the Theme picker right alongside them — see
**Where to put your own theme** below.

(If you're an AI agent about to extend the theming *engine* itself, or migrate another
CSS file onto it, read `THEMING-INTERNALS.md` in this same folder instead — it covers
the internals, gotchas, and how the resolver actually works. This file is "how do I
write a theme.json," not "how does the machinery work.")

## Quickest way to make one

Copy an existing theme's folder, rename it, change the `id` and `label`, then tweak
whichever colors you want different. You almost never need to touch anything else.

```json
{
  "id": "my-theme",
  "label": "My Theme",
  "extends": "base",
  "order": 10,
  "tokens": {
    "color": {
      "background": "#0d0d12",
      "primary": "#ffb703"
    }
  }
}
```

That's a complete, valid theme. Every color/font/shape you don't mention is inherited
from `base` (the built-in default look), so a short override like this is fine — you
don't need to restate every value.

- `id` — the folder name, used internally. Keep it short, lowercase, hyphenated.
- `label` — what shows up in the Theme dropdown.
- `extends` — almost always `"base"`. You can also extend another theme (say you want
  "Kawaii Dream, but pinker" — extend `"kawaii-dream"` and override just the accent).
- `order` — where it sits in the dropdown list, lower numbers first. Optional — leave it
  out and it sorts alphabetically after the ones that do have a number.
- `tokens` — the actual values. See below for what's available.

## Where to put your own theme

Bundled themes live in this folder (`resources/themes/<id>/theme.json`), inside the
app itself. A theme you author yourself doesn't belong here — it goes in a separate,
per-user folder that survives app updates:

| OS | Folder |
|---|---|
| Windows | `%APPDATA%\RPgraph Studio\themes\` |
| macOS | `~/Library/Application Support/RPgraph Studio/themes/` |
| Linux | `~/.config/RPgraph Studio/themes/` |

Create a subfolder there with your theme's id (matching the one-folder-per-theme layout
you see in this directory) containing your `theme.json`, then **restart the app** — the
theme picker doesn't currently re-scan this folder while the app is running, only at
startup. It'll then show up in Menu (☰) → Theme, mixed in with the bundled ones.

If you use the same `id` as a bundled theme, your version wins — this is the intended
way to fork and tweak a built-in theme without touching the installed app's files.

## What you can set

Everything lives under `tokens`, grouped into a few categories. You only need to
include the ones you're actually changing.

### `color` — the one category you'll actually use

This is the main palette almost every theme only needs to touch. Setting these alone
is enough to reskin the entire app — Graph mode, the Storybook editor, and the app's
menus/dialogs all automatically pick up matching colors derived from this palette (see
"Do I need to theme Graph mode and the Storybook editor separately?" below).

| Key | What it colors |
|---|---|
| `background` | The outermost app background |
| `backgroundElevated` | The play-mode shell, one shade up from background |
| `header` | The top header bar |
| `surfaceRail` | The bottom activity rail (Chat / Phone / Events tabs) |
| `surfaceContent` | The main chat content area |
| `panel` | Buttons, dialogs, the theme picker, the composer box |
| `card` | The active character tab |
| `cardStrong` | Assistant message bubbles |
| `input` | Text inputs, textareas, dropdowns |
| `foreground` | Main text color |
| `mutedForeground` | Secondary/label text |
| `primary` | Your main accent color — buttons, active states, links |
| `primaryForeground` | Text drawn on top of a `primary`-colored button |
| `secondary` | A second accent color, used more sparingly |
| `border` / `borderSoft` | Line/divider colors, solid and faint |
| `userBubble` / `userBubbleBorder` | Your own chat message bubble |
| `rail` | Icon/label color in the activity rail |
| `complete` | A success/complete indicator color |
| `phoneGlass` | The tint on the in-app phone's glass frame |

Any standard CSS color works: `"#ff8cc6"`, `"rgba(255, 140, 198, 0.9)"`, even
`"color-mix(in srgb, #fff 20%, #000)"` if you want to get fancy.

### Do I need to theme Graph mode and the Storybook editor separately?

No, not by default. Four more categories exist — `graph`, `storybook`, `shell`, and
`app` — but they're **automatically derived from your `color` values** (e.g. Graph
mode's panel background follows `color.panel`, its accent follows `color.primary`, and
so on). Setting `color` alone repaints the whole app consistently.

You only need to touch these if you want one surface to deliberately diverge from your
main palette — say, a Graph mode that's moodier than your chat UI. In that case, add
whichever of these you want to override; the "Classic" theme (`classic/theme.json` in
this folder) is a real, complete example of pinning all three independently instead of
deriving them, if you want to see the full set of keys they accept.

- `graph.*` — Graph mode's workflow canvas: panel/sidebar backgrounds, node chrome,
  connection lines, the accent/success/violet colors used for ports and status pills.
- `storybook.*` — the Storybook editor's own panel/text/accent palette, plus a violet
  and pink/lime pair used for character badges and highlights.
- `shell.*` — miscellaneous Play-mode chrome that doesn't map to one semantic `color`
  slot: the composer, the tab strip, badges, topbar buttons.
- `app.*` — the app's oldest, most-reused palette (dialog backgrounds/borders/text used
  by Options, Providers, System Log, NPC Library, and 25+ other dialogs; plus generic
  success/warning/danger status colors).

### `typography`

- `headingFont` / `bodyFont` — a font stack, e.g. `"Consolas, 'Courier New', monospace"`.
  Leave unset for the app's normal font.
- `fontWeight` / `fontWeightHeading` — numeric weight strings, e.g. `"700"`.
- `letterSpacing` — e.g. `"0.02em"`, or `"normal"`.
- `textTransform` — `"none"` or `"uppercase"`.
- `baseSize` — the base UI font size, e.g. `"13px"`.
- `lineHeight` — e.g. `"1.45"`.

### `shape`

- `radius` — the base corner rounding, e.g. `"8px"`, `"16px"` for something rounder,
  `"2px"` for something sharper.
- `radiusCard` / `radiusButton` / `radiusInput` — extra radii for specific element
  types, if you want them different from the base `radius` (each falls back to
  `radius` if you don't set it).
- `borderWidth` / `borderStyle` — e.g. `"1px"` / `"solid"`.
- `clipPath` — a CSS `clip-path` polygon, for a non-rectangular look. `"none"` normally.

### `effect`

- `cardShadow` / `buttonShadow` / `buttonShadowHover` — full `box-shadow` values.
  `"none"` to turn them off.
- `accentGlow` — a `text-shadow` value for a glow effect on message text, e.g.
  `"0 0 10px rgba(100, 255, 150, 0.4)"`. `"none"` to turn it off.
- `backgroundTexture` — a background layer (gradient, pattern) shown behind the header,
  e.g. `"linear-gradient(90deg, rgba(128, 24, 62, 0.18), transparent 45%)"`.
- `buttonBackground` — normally left alone; it defaults to your `primary` color.

### `motion`

- `transitionDuration` — e.g. `"160ms"`.
- `transitionEasing` — e.g. `"ease-out"`.
- `hoverScale` — a scale factor for hover states, e.g. `"1.03"`. `"1"` disables it.

## A worked example

Here's a theme that leans into a warm, retro-terminal look — changes a font, adds a
glow, and shifts the palette, without touching anything else:

```json
{
  "id": "amber-terminal",
  "label": "Amber Terminal",
  "extends": "base",
  "order": 11,
  "tokens": {
    "color": {
      "background": "#0a0600",
      "backgroundElevated": "#120b00",
      "header": "#1a1000",
      "panel": "#150d00",
      "card": "#1c1200",
      "cardStrong": "#241700",
      "foreground": "#ffcc66",
      "mutedForeground": "#b3894d",
      "primary": "#ffb000",
      "primaryForeground": "#100a00",
      "border": "rgba(255, 176, 0, 0.4)",
      "userBubble": "#1f1300",
      "userBubbleBorder": "rgba(255, 176, 0, 0.7)"
    },
    "typography": {
      "bodyFont": "'Courier New', monospace"
    },
    "shape": {
      "radius": "3px"
    },
    "effect": {
      "accentGlow": "0 0 8px rgba(255, 176, 0, 0.35)"
    }
  }
}
```

Setting `color.primary` alone is enough for Graph mode's accents, the Storybook
editor's highlights, and every dialog's success/accent color to shift toward amber too
— you don't need to repeat it under `graph`/`storybook`/`app` unless you want one of
those surfaces to look different from the rest.

## A couple of things to know

- The theme picker lives in the topbar's menu (☰ icon) → **Theme**, and applies to both
  Play mode and Graph mode.
- If a color you set doesn't seem to show up somewhere you expected, it's most likely
  that particular element uses a narrow, decorative one-off color that's intentionally
  fixed rather than tied to any of the categories above (a status dot, a glassy
  highlight, a drop shadow) — not every pixel in the app is meant to be themeable.
- The phone's app registration/profile screens (dating app, social-media-style profile
  editors) and the simulated phone apps' own content are deliberately left out of
  theming — those were recreated to match real app designs down to the pixel, and stay
  that way on purpose rather than getting reskinned. The physical phone bezel/casing
  around them is themeable chrome, though.
- Graph mode's canvas background itself (behind the nodes) is also intentionally left
  as-is regardless of theme — a limitation of the canvas library it's built on, not a
  missing token. Everything around it (sidebars, panels, node cards, connection lines)
  does follow your theme.
- This is a hand-edit-the-file system today. A visual "pick your colors here" theme
  editor is planned but doesn't exist yet — for now, editing `theme.json` directly (or
  asking an AI assistant to do it for you, describing the look you want) is the way to
  make one.
