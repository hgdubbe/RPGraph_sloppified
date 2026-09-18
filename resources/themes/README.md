# RPGraph Studio themes

Themes change the visual language of the entire RPGraph Studio interface. A theme can
control the Play view, chat, phone frame, simulated phone apps, Graph mode, Storybook,
dialogs, typography, geometry, shadows, textures, and motion. It is data-driven: a
theme is a folder containing one `theme.json` file; no code change or rebuild is needed.

The complete commented reference is next to this document:
[`example.json`](example.json). It is intentionally broad rather than pretty. Copy it,
remove the comments, and make it your own. The runtime currently parses strict JSON;
comments are for the reference file only.

## Install a theme

Bundled themes live in `resources/themes/<id>/theme.json`. User themes belong in the
per-user themes folder so app updates do not overwrite them:

| OS | Folder |
|---|---|
| Windows | `%APPDATA%\RPgraph Studio\themes\` |
| macOS | `~/Library/Application Support/RPgraph Studio/themes/` |
| Linux | `~/.config/RPgraph Studio/themes/` |

Create a folder named after the theme id and put `theme.json` inside it. Restart the
app, then select the theme from the topbar menu under **Theme**. Themes are discovered
at startup. A user theme with the same `id` as a bundled theme overrides the bundled
copy, which is the easiest way to maintain a personal fork.

## Smallest useful theme

Most themes only need metadata and a few `color` values:

```json
{
  "id": "my-theme",
  "label": "My Theme",
  "extends": "base",
  "order": 20,
  "tokens": {
    "color": {
      "background": "#111218",
      "foreground": "#f7f3e8",
      "primary": "#f0a35b",
      "secondary": "#7fc7b5"
    }
  }
}
```

Values are CSS value strings. Hex, `rgb()`/`rgba()`, gradients, `var(...)`, shadows,
and other CSS expressions are valid. Unspecified values are inherited from `base` or
derived from the colors you did set.

### Metadata

- `id`: stable, unique folder name; use lowercase kebab-case.
- `label`: name shown in the theme picker.
- `extends`: another theme id. It defaults to `base`; the child overrides the parent.
- `order`: optional picker order; lower numbers appear first.
- `hidden`: optional. Set it to `true` for a private base/helper theme.
- `basic`: optional simple knobs used as inputs for derived values.
- `tokens`: optional advanced values, grouped in nested objects.

The `source` field is added by the app and must not be authored in a theme file.

## How values are resolved

The resolver merges the `extends` chain from the oldest parent to the selected theme.
Explicit token values always win. Missing advanced values can be derived from the
basic palette, and guaranteed core values finally fall back to `base`.

```text
basic palette -> color.* -> graph/storybook/app derived palette
                              explicit advanced tokens override derivation
```

Changing `color.primary` normally updates Graph, Storybook, dialogs, links, and other
Studio accents as well. Add an explicit `graph`, `storybook`, `app`, or `shell` value
when one surface should intentionally diverge.

## Themeable areas

### `basic`

The seven simple inputs are `primary`, `secondary`, `background`, `foreground`,
`headingFont`, `bodyFont`, and `radius`. They are useful for a compact theme and for
future theme-editor controls. Advanced `tokens` values take precedence over anything
derived from `basic`.

### `tokens.color`

The main Studio palette is `background`, `backgroundElevated`, `header`, `surfaceRail`,
`surfaceContent`, `panel`, `card`, `cardStrong`, `input`, `foreground`,
`mutedForeground`, `primary`, `primaryForeground`, `secondary`, `border`, `borderSoft`,
`userBubble`, `userBubbleBorder`, `rail`, `complete`, and `phoneGlass`.

These control the application shell, chat, composer, activity rail, tabs, active
states, message bubbles, borders, success indicators, and the phone glass tint.

### `tokens.shell`

Fine-grained Play-mode chrome: `chatSurface`, `messageBorder`, `messageText`,
`labelStrong`, `inputBorder`, `segmentedBg`, `iconColor`, `iconButtonBg`,
`autoTurnText`, `railBorder`, `characterStripBg`, `railActiveColor`,
`railActiveBorder`, `railActiveBg`, `badgeBorder`, `badgeText`, `badgeBg`,
`badgeGlow`, `tabBorder`, `tabBorderBottom`, `tabText`, `tabBg`, `tabActiveBorder`,
`tabActiveBg`, `tabActiveText`, `tabSubtext`, `topbarButtonBorder`,
`topbarButtonText`, `topbarButtonBg`, `topbarHoverBg`, `topbarHoverBorder`,
`badgeAccentBg`, `topbarContextBorder`, `topbarMutedText`, and `topbarSelectBg`.

### `tokens.graph`

Graph mode's canvas surroundings, panels, nodes, lines, labels, ports, and status
accents: `background`, `chrome`, `panel`, `panel2`, `line`, `lineSoft`, `text`,
`muted`, `faint`, `accent`, `accentSoft`, `success`, and `violet`.

The canvas library's own canvas and node-background rendering retains its built-in
appearance; the Graph shell around it is themeable.

### `tokens.storybook`

Storybook editor surfaces and highlights: `background`, `panel`, `passive`, `line`,
`lineSoft`, `text`, `muted`, `faint`, `accent`, `accentSoft`, `violet`, `violetSoft`,
`pink`, and `lime`.

### `tokens.app`

The shared palette used by dialogs and older Studio components: `accent`,
`accentLight`, `surface`, `surfaceAlt`, `surfaceSoft`, `line`, `muted`, `cyan`,
`wire`, `success`, `successSoft`, `warning`, `warningSoft`, `danger`, `dangerSoft`,
`softWhite`, `dialogBg`, `dialogBorder`, `dialogText`, and `text`.

### `tokens.typography`, `shape`, `effect`, and `motion`

- `typography`: `headingFont`, `bodyFont`, `fontWeight`, `fontWeightHeading`,
  `letterSpacing`, `textTransform`, `baseSize`, and `lineHeight`.
- `shape`: `radius`, `radiusCard`, `radiusButton`, `radiusInput`, `borderWidth`,
  `borderStyle`, and `clipPath`.
- `effect`: `cardShadow`, `buttonShadow`, `buttonShadowHover`, `accentGlow`,
  `backgroundTexture`, and `buttonBackground`.
- `motion`: `transitionDuration`, `transitionEasing`, and `hoverScale`.

`clipPath` accepts a complete CSS `polygon(...)`; `backgroundTexture` accepts a
complete gradient or pattern expression.

### Independent simulated phone apps

Phone apps keep their own visual identities by default. They do not automatically
inherit `color.primary`, so changing the Studio accent does not unexpectedly repaint
an in-world banking or social app. You can opt in to each app independently:

- `phoneNotes`: `background`, `text`, `textStrong`, `accent`, `accentLight`,
  `accentStrong`, `accentDeep`, `danger`, and the eight RGB-triplet note tints
  `tintNeutral`, `tintSand`, `tintCoral`, `tintPeach`, `tintMint`, `tintSky`,
  `tintLavender`, and `tintRose`.
- `phoneChatgpd`: `background`, `panelStrong`, `glass`, `text`, `textStrong`,
  `textOnAccent`, `accent`, `accentLight`, `accentDeep`, `accentBright`, and `danger`.
- `phoneBanking`: `background`, `panel`, `line`, `text`, `textStrong`, `muted`,
  `accent`, `accentStrong`, `accentDeep`, `success`, and `danger`.
- `phoneGallery`: `background`, `panel`, `stage`, `line`, `text`, `textStrong`,
  `muted`, `badge`, `success`, and `danger`.
- `phoneSocial`: shared `background`, `panel`, `panelAlt`, `panelDeep`,
  `bubbleIncoming`, `glass`, `line`, `text`, `textStrong`, `muted`, `tip`, `tipText`,
  `success`, `danger`, and `dangerBg`; plus separate brand values for `fotogramAccent`,
  `fotogramAccentStrong`, `fotogramCard`, `onlyfriendsAccent`,
  `onlyfriendsAccentStrong`, `onlyfriendsGlow`, `onlyfriendsBackground`,
  `onlyfriendsCard`, and `onlyfriendsBubbleIncoming`.

The note tint values are deliberately bare RGB triplets such as `"224, 193, 139"`,
not complete colors. This is the one place where the value format is unusual.

### `tokens.raw`

The `raw` namespace exposes repeated, low-level CSS literals that do not have a
semantic role, such as a rare overlay or a physical phone-bezel highlight. Their names
look like `vrgba255255255005` or `v131b28`, because they are generated from the original
literal. They are optional and preserve the original CSS fallback when omitted. Use
them only when you deliberately want to retint one of those fixed details; prefer the
semantic namespaces above for normal theme design.

Any additional nested string token is also flattened into a CSS custom property. This
keeps the format forward-compatible, but an arbitrary token only has a visible effect
when the application CSS consumes that variable.

## Practical notes

- A theme switch applies to both Play mode and Graph mode immediately.
- Restart after adding or replacing a user theme so the library is rescanned.
- Use `base` as the parent unless you are intentionally building a family of themes.
- Keep text/background contrast readable; `primaryForeground` controls text on primary
  buttons when you override the main accent.
- Fixed, hand-crafted content such as simulated phone OS chrome and registration
  artwork is outside the shared theme palette. The functional phone apps are the
  deliberate exception and have their own namespaces above.
