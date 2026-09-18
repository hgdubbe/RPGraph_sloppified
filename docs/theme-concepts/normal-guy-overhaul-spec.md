# Normal Guy overhaul — implementation specification

## 1. Objective and scope

- Repository: RPGraph Studio at commit `bc40612` on branch `theme_overhaul_v2`.
- Existing bundled theme: `Normal Guy`, id `normal-guy`, at `resources/themes/normal-guy/theme.json`.
- Dominant workflow: balanced, application-wide use across Play, Graph, Storybook, dialogs, menus, and shared chrome.
- Target after approval: update the existing bundled theme in place, preserving its id and picker order. Overwriting the existing manifest requires explicit approval after review.
- Preserve: RPGraph layout and behavior, theme discovery, semantic warning/danger meaning, independent phone-app brands, and all unrelated files.
- Current stage: **concept specified; mockup created; theme file generated; static/resolver/registry validation passed; live visual inspection and activation not performed**.

The engine deep-merges this theme over `base`. Main `color.*` values drive derived Graph, Storybook, and shared-app roles; `shell.*` values are fixed in Base unless overridden. This design therefore overrides the shell deliberately while leaving Graph, Storybook, and `app.*` roles to derive from the same monochrome palette. The Graph canvas behind nodes remains fixed.

## 2. Visual thesis

**Black lacquer grand tourer:** near-black layered bodywork, smoked graphite cabins, crisp silver instrumentation, and narrow reflective highlights. The result should feel engineered, elegant, and expensive across the whole application—not blue, neon, gamer-styled, or aggressively automotive.

Principles:

1. Use black through material contrast, not one flat fill.
2. Silver carries primary actions and active selection; blue is absent from the authored palette.
3. Gloss appears only in supported header and button placements.
4. Tight radii and precise borders suggest machined components without becoming harsh.
5. Semantic success, warning, and danger remain distinguishable from decorative silver.

Anti-patterns:

- No carbon-fiber imitation, racing stripes, logos, or literal car imagery.
- No cyan/blue glow and no blanket glass effect.
- No pure-white panels or high-glare reading surfaces.
- No layout, density, navigation, or component redesign.

## 3. Native token mapping

### Core palette

| RPGraph key | Proposed value | Intended result | Validation surface |
| --- | --- | --- | --- |
| `color.background` | `#050506` | Deepest lacquer-black app background | Main shell/Graph/Storybook |
| `color.backgroundElevated` | `#090a0c` | Lifted outer frame | Play frame |
| `color.header` | `#0d0e10` | Gloss-supporting header base | Header |
| `color.surfaceRail` | `#08090b` | Low-reflection navigation rail | Rail |
| `color.surfaceContent` | `#07080a` | Quiet content field | Main work areas |
| `color.panel` | `#101216` | Graph panels, dialogs, composer | Shared panels |
| `color.card` | `#15181c` | Nodes, cards, passive tabs | Cards/nodes |
| `color.cardStrong` | `#1b1f24` | Raised messages and selected cards | Messages/cards |
| `color.input` | `#030405` | Recessed black controls | Inputs |
| `color.foreground` | `#f3f4f6` | Crisp primary text | All dark surfaces |
| `color.mutedForeground` | `#a6abb2` | Secondary text with metallic neutrality | Labels/subtext |
| `color.primary` | `#d8dde3` | Primary silver action/selection | Buttons/active state |
| `color.primaryForeground` | `#0a0b0d` | Black text on silver | Primary buttons |
| `color.secondary` | `#9299a2` | Smoked-silver secondary accent | Graph/Storybook secondary roles |
| `color.border` | `rgba(210, 216, 224, 0.36)` | Machined bright edge | Main boundaries |
| `color.borderSoft` | `rgba(210, 216, 224, 0.18)` | Quiet seam | Dividers |
| `color.userBubble` | `#171a1f` | Distinct graphite user surface | User message |
| `color.userBubbleBorder` | `rgba(216, 221, 227, 0.58)` | Silver user-message edge | User message |
| `color.rail` | `#bdc3ca` | Inactive navigation text/icons | Rail |
| `color.complete` | `#92b89b` | Muted premium green completion | Success/completion |
| `color.phoneGlass` | `rgba(12, 14, 17, 0.68)` | Smoked phone chrome where consumed | Phone chrome |

### Deliberate shell overrides

| RPGraph key | Proposed value | Intended result |
| --- | --- | --- |
| `shell.chatSurface` | `#0b0d10` | Lacquer-black conversation bay |
| `shell.messageBorder` | `rgba(210, 216, 224, 0.24)` | Fine message seam |
| `shell.messageText` | `#f3f4f6` | Consistent reading text |
| `shell.labelStrong` | `#ffffff` | Instrument-like message labels |
| `shell.inputBorder` | `rgba(216, 221, 227, 0.44)` | Silver composer boundary |
| `shell.segmentedBg` | `#181b20` | Grouped run controls |
| `shell.iconColor` | `#d7dbe0` | Neutral silver icons |
| `shell.iconButtonBg` | `#14171b` | Secondary control body |
| `shell.autoTurnText` | `#0a0b0d` | Black on silver action |
| `shell.railBorder` | `rgba(210, 216, 224, 0.16)` | Rail seam |
| `shell.characterStripBg` | `#0a0b0d` | Character strip continuity |
| `shell.railActiveColor` | `#f0f2f4` | Bright-silver active navigation |
| `shell.railActiveBorder` | `rgba(228, 232, 237, 0.68)` | Selected control edge |
| `shell.railActiveBg` | `rgba(216, 221, 227, 0.10)` | Restrained active fill |
| `shell.badgeBorder` | `rgba(4, 5, 6, 0.82)` | Badge edge |
| `shell.badgeText` | `#0b160e` | Dark text on muted green |
| `shell.badgeBg` | `#92b89b` | Completion badge |
| `shell.badgeGlow` | `rgba(146, 184, 155, 0.20)` | Restrained status lift |
| `shell.tabBorder` | `rgba(210, 216, 224, 0.30)` | Tab body edge |
| `shell.tabBorderBottom` | `rgba(210, 216, 224, 0.16)` | Tab row seam |
| `shell.tabText` | `#bdc3ca` | Inactive tab text |
| `shell.tabBg` | `#0c0e11` | Inactive tab body |
| `shell.tabActiveBorder` | `rgba(235, 238, 242, 0.76)` | Bright selected edge |
| `shell.tabActiveBg` | `#1d2126` | Selected graphite tab |
| `shell.tabActiveText` | `#f5f6f7` | Selected tab text |
| `shell.tabSubtext` | `#979da5` | Secondary tab text |
| `shell.topbarButtonBorder` | `rgba(210, 216, 224, 0.30)` | Topbar control edge |
| `shell.topbarButtonText` | `#d7dbe0` | Topbar control text |
| `shell.topbarButtonBg` | `#111317` | Topbar control body |
| `shell.topbarHoverBg` | `rgba(216, 221, 227, 0.10)` | Silver hover reflection |
| `shell.topbarHoverBorder` | `rgba(228, 232, 237, 0.62)` | Hover edge |
| `shell.badgeAccentBg` | `#aeb4bb` | Neutral non-semantic badge |
| `shell.topbarContextBorder` | `rgba(210, 216, 224, 0.20)` | Context divider |
| `shell.topbarMutedText` | `#9da3aa` | Quiet context text |
| `shell.topbarSelectBg` | `#0c0e11` | Select body |

Graph, Storybook, and shared `app.*` roles remain un-authored so the resolver derives them from the core palette. Phone-app namespaces remain un-authored to preserve their independent brands.

### Typography, geometry, material, and motion

| RPGraph key | Proposed value | Intended result |
| --- | --- | --- |
| `typography.headingFont` | `"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif` | Clean premium instrumentation |
| `typography.bodyFont` | `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` | Comfortable application-wide reading |
| `typography.fontWeight` | `600` | Controlled weight |
| `typography.fontWeightHeading` | `750` | Confident hierarchy |
| `typography.letterSpacing` | `0.015em` | Precision without spaced-out text |
| `typography.textTransform` | `none` | Avoid aggressive automotive styling |
| `typography.baseSize` | `13px` | Preserve current density |
| `typography.lineHeight` | `1.48` | Balanced long-form reading |
| `shape.radius` | `6px` | Tight engineered geometry |
| `shape.radiusCard` | `8px` | Slight softness on cards/messages |
| `shape.radiusButton` | `6px` | Machined controls |
| `shape.radiusInput` | `6px` | Recessed precision inputs |
| `shape.borderWidth` | `1px` | Fine bright edges |
| `shape.borderStyle` | `solid` | Clean material boundary |
| `effect.cardShadow` | `0 18px 42px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.035)` | Deep elevation and a narrow lacquer reflection |
| `effect.buttonShadow` | `0 6px 16px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.72)` | Polished silver control |
| `effect.buttonShadowHover` | `0 8px 22px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.86)` | Stronger supported hover reflection |
| `effect.accentGlow` | `none` | No text glow |
| `effect.backgroundTexture` | `linear-gradient(112deg, transparent 0 28%, rgba(255, 255, 255, 0.055) 42%, transparent 57%), linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 62%)` | Moving-bodywork illusion in the fixed header placement only |
| `effect.buttonBackground` | `linear-gradient(180deg, #f2f4f6 0%, #c6ccd3 48%, #aeb5bd 52%, #dfe3e7 100%)` | Layered metallic silver buttons |
| `motion.transitionDuration` | `140ms` | Fast premium response |
| `motion.transitionEasing` | `cubic-bezier(0.2, 0.75, 0.2, 1)` | Controlled deceleration |
| `motion.hoverScale` | `1.01` | Nearly imperceptible physical feedback |

## 4. Themeable surfaces and states

- **Play:** black header, graphite conversation well, crisp message text, silver actions, precise composer, tabs, rail, and badges.
- **Graph:** workbench chrome, panels, node cards, lines, text, selection, ports, and success accents derive from the same palette. The canvas behind nodes remains fixed.
- **Storybook:** panels, lines, hierarchy, accents, and highlights derive from the monochrome system.
- **Dialogs and menus:** shared `app.*` roles derive from black panels, silver borders, and light text.
- **Phone apps:** Notes, ChatGPD, Banking, Gallery, Fotogram, and OnlyFriends keep their existing independent brands.
- **Success/completion:** muted green. Warning and danger retain RPGraph's existing semantic fallbacks.
- **Disabled/focus:** existing RPGraph opacity, cursor, and focus behavior remains unchanged.

## 5. Accessibility and usability checks

After implementation, measure and inspect body, muted, button, tab, input, user-message, dialog, Graph-node, Storybook, success, warning, and danger pairs at their rendered sizes. Verify silver active cues remain distinct from inactive gray, Graph edges remain readable against the fixed canvas, header gloss does not obscure context text, long roleplay passages remain comfortable, and shadows do not collapse black surface boundaries. These are checks, not a blanket WCAG-conformance claim.

## 6. Mockup and fidelity

The companion board shows shared shell chrome plus representative Play, Graph, Storybook, status, input, button, and palette surfaces. It uses exact proposed values and supported effect placements, but remains isolated HTML with approximate proportions.

> Concept mockup only — this is a visual direction preview, not a generated or validated RPGraph theme.

## 7. Implementation plan after approval

1. Completed: reinspected the repository, current manifest, schema, resolver, and consumers.
2. Completed: replaced only `resources/themes/normal-guy/theme.json`, preserving id, label, and order.
3. Completed: parsed JSON and verified all 79 authored leaves are current core tokens.
4. Completed: focused resolver and registry tests passed.
5. Pending separate request: load/select and inspect Play, Graph, Storybook, dialogs, menus, portal controls, and semantic statuses.

## 8. Acceptance criteria and limitations

- The result reads as glossy black and silver rather than blue-black or neon.
- Material hierarchy is visible across the whole application without changing layout.
- Every authored key is a verified current RPGraph token.
- Derived Graph, Storybook, and app surfaces remain intentional.
- Fixed canvas and independently branded phone apps are reported honestly.
- No unrelated application source or behavior changes occur.
- Unknown until live inspection: font fallback appearance, gloss strength under real compositing, Graph visibility against the fixed canvas, and portal/status rendering.
