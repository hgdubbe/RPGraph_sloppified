# Kawaii Dream overhaul — implementation specification

## 1. Objective and scope

- Repository: RPGraph Studio at commit `bc40612` on branch `theme_overhaul_v2`.
- Existing bundled theme: `Kawaii Dream`, id `kawaii-dream`, at `resources/themes/kawaii-dream/theme.json`.
- Dominant workflow: Play view, especially long roleplay reading and writing.
- Target after approval: update the existing bundled theme in place, preserving its id and picker order. This will overwrite the existing bundled manifest only after explicit approval.
- Preserve: RPGraph layout, component behavior, navigation, phone-app brands, theme discovery, and all unrelated files.
- Current stage: **concept specified; mockup created; theme file generated; static/resolver/registry validation passed; live visual inspection and activation not performed**.

The current engine deep-merges `kawaii-dream` over `base`. Main `color.*` values drive derived Graph, Storybook, and shared-app palettes, while `shell.*` values are fixed in Base unless explicitly overridden. The proposed overhaul therefore includes deliberate Play-shell overrides. The Graph canvas behind nodes and hand-crafted phone/registration surfaces remain outside shared-theme control.

## 2. Visual thesis

**Pastel dream morning:** a luminous cream-lilac reading environment with blush-pink actions, lavender selection cues, and mint completion states. Soft pastel surfaces carry the identity throughout Play view while dark-plum text preserves comfortable long-form reading.

Principles:

1. Reading surfaces are light cream-lilac, with gentle pastel separation between layers.
2. Pink means primary action; lavender means secondary selection; mint means completion.
3. Soft elevation and rounded geometry create warmth without turning the interface toy-like.
4. The header carries the “dream” signature through a restrained radial texture.
5. Graph and Storybook inherit the same palette rather than becoming separate visual products.

Anti-patterns:

- No blanket glow or glass across message text.
- No cyan inherited shell states competing with the pink/lavender system.
- No pastel-on-pastel body text; dark plum remains the reading color.
- No layout, spacing, component, or phone-app redesign.

## 3. Native token mapping

### Core palette

| RPGraph key | Proposed value | Intended result | Validation surface |
| --- | --- | --- | --- |
| `color.background` | `#f4eaf6` | Outermost cream-lilac shell | Main shell |
| `color.backgroundElevated` | `#fff8fd` | Luminous elevated Play frame | Play frame |
| `color.header` | `#ead7f0` | Distinct pastel header base | Play header |
| `color.surfaceRail` | `#f0e2f3` | Quiet lavender navigation rail | Activity rail |
| `color.surfaceContent` | `#fbf4fb` | Warm reading field | Play content/footer |
| `color.panel` | `#f3e6f4` | Composer and panel surface | Composer/dialogs |
| `color.card` | `#ead8ed` | Selected tabs and cards | Tabs/cards |
| `color.cardStrong` | `#e2cde7` | Assistant message surface | Story output |
| `color.input` | `#fffafe` | Bright recessed input field | Composer input |
| `color.foreground` | `#3a273f` | Dark-plum readable text | All pastel surfaces |
| `color.mutedForeground` | `#765f7b` | Secondary labels | Header/subtext |
| `color.primary` | `#e96eae` | Primary action and active cue | Submit/active rail |
| `color.primaryForeground` | `#2b1322` | Dark text over pink/lavender buttons | Primary buttons |
| `color.secondary` | `#a88adf` | Secondary selection/accent | Derived Graph/Storybook accents |
| `color.border` | `rgba(111, 72, 120, 0.38)` | Clear structural outline | Panels/controls |
| `color.borderSoft` | `rgba(111, 72, 120, 0.20)` | Quiet separators | Tabs/footer |
| `color.userBubble` | `#f2cde5` | Distinct blush user input bubble | User message |
| `color.userBubbleBorder` | `rgba(208, 78, 145, 0.68)` | Primary-colored bubble edge | User message |
| `color.rail` | `#674e6d` | Inactive navigation | Activity rail |
| `color.complete` | `#65b58c` | Completion/success independent of actions | Status/badges |
| `color.phoneGlass` | `rgba(255, 248, 253, 0.58)` | Theme-compatible phone glass only | Phone chrome where consumed |

### Deliberate Play-shell overrides

| RPGraph key | Proposed value | Intended result |
| --- | --- | --- |
| `shell.chatSurface` | `#f8eef8` | Quiet conversation container |
| `shell.messageBorder` | `rgba(111, 72, 120, 0.24)` | Readable message boundary |
| `shell.messageText` | `#3a273f` | Consistent body copy |
| `shell.labelStrong` | `#5b365f` | Message labels distinct from body |
| `shell.inputBorder` | `rgba(208, 78, 145, 0.48)` | Composer focus region |
| `shell.segmentedBg` | `#e6d2eb` | Run-control grouping |
| `shell.iconColor` | `#5f4766` | Neutral icon legibility |
| `shell.iconButtonBg` | `#eadbed` | Secondary button surface |
| `shell.autoTurnText` | `#2b1322` | Dark text on pink action |
| `shell.railBorder` | `rgba(111, 72, 120, 0.18)` | Quiet rail boundary |
| `shell.characterStripBg` | `#f6eaf7` | Character strip separation |
| `shell.railActiveColor` | `#a33b75` | Deep pink active navigation |
| `shell.railActiveBorder` | `rgba(208, 78, 145, 0.64)` | Active navigation outline |
| `shell.railActiveBg` | `rgba(233, 110, 174, 0.15)` | Active navigation fill |
| `shell.badgeBorder` | `rgba(43, 19, 34, 0.30)` | Badge edge |
| `shell.badgeText` | `#173d2d` | Dark text on mint badge |
| `shell.badgeBg` | `#aee8cb` | Completion badge |
| `shell.badgeGlow` | `rgba(101, 181, 140, 0.18)` | Restrained status emphasis |
| `shell.tabBorder` | `rgba(111, 72, 120, 0.30)` | Tab structure |
| `shell.tabBorderBottom` | `rgba(111, 72, 120, 0.17)` | Tab row separation |
| `shell.tabText` | `#765f7b` | Inactive tab text |
| `shell.tabBg` | `#f0e1f2` | Inactive tab surface |
| `shell.tabActiveBorder` | `rgba(126, 94, 186, 0.72)` | Lavender selection cue |
| `shell.tabActiveBg` | `#dfd0f4` | Selected tab surface |
| `shell.tabActiveText` | `#3a273f` | Selected tab text |
| `shell.tabSubtext` | `#816c86` | Secondary tab information |
| `shell.topbarButtonBorder` | `rgba(111, 72, 120, 0.28)` | Topbar control outline |
| `shell.topbarButtonText` | `#5f4766` | Topbar control text |
| `shell.topbarButtonBg` | `#f3e4f4` | Topbar control surface |
| `shell.topbarHoverBg` | `rgba(168, 138, 223, 0.18)` | Lavender hover feedback |
| `shell.topbarHoverBorder` | `rgba(126, 94, 186, 0.62)` | Hover outline |
| `shell.badgeAccentBg` | `#ef8bc0` | Non-completion accent badge |
| `shell.topbarContextBorder` | `rgba(111, 72, 120, 0.22)` | Context separator |
| `shell.topbarMutedText` | `#806a84` | Quiet context text |
| `shell.topbarSelectBg` | `#f6eaf7` | Select control surface |

Graph, Storybook, and shared `app.*` roles should remain un-authored so the resolver derives them from the new `color.*` palette. Phone-app namespaces remain un-authored to preserve their independent brands.

### Typography, shape, effects, and motion

| RPGraph key | Proposed value | Intended result |
| --- | --- | --- |
| `typography.headingFont` | `ui-rounded, "Segoe UI", sans-serif` | Soft headings without bundled fonts |
| `typography.bodyFont` | `"Segoe UI", system-ui, sans-serif` | Familiar long-form reading |
| `typography.fontWeight` | `650` | Less heavy body/UI text than Base |
| `typography.fontWeightHeading` | `800` | Clear hierarchy without maximal weight |
| `typography.letterSpacing` | `0.01em` | Slightly airy UI labels |
| `typography.textTransform` | `none` | Friendly natural casing |
| `typography.baseSize` | `13px` | Preserve current density |
| `typography.lineHeight` | `1.55` | Improve long roleplay reading |
| `shape.radius` | `12px` | Warm base geometry |
| `shape.radiusCard` | `18px` | Softer user bubbles/cards |
| `shape.radiusButton` | `12px` | Consistent controls |
| `shape.radiusInput` | `12px` | Composer consistency |
| `shape.borderWidth` | `1px` | Preserve visual lightness |
| `shape.borderStyle` | `solid` | Preserve clear boundaries |
| `effect.cardShadow` | `0 14px 32px rgba(91, 54, 95, 0.14)` | Soft elevation on supported containers |
| `effect.buttonShadow` | `0 5px 14px rgba(181, 64, 130, 0.18)` | Restrained primary-action lift |
| `effect.buttonShadowHover` | `0 7px 20px rgba(181, 64, 130, 0.25)` | Supported hover feedback |
| `effect.accentGlow` | `none` | Protect long-form text from glow |
| `effect.backgroundTexture` | `radial-gradient(circle at 18% 10%, rgba(255, 255, 255, 0.72), transparent 34%), radial-gradient(circle at 82% 0%, rgba(200, 169, 255, 0.32), transparent 32%)` | Dream signature in the header only |
| `effect.buttonBackground` | `linear-gradient(135deg, #e96eae, #a88adf)` | Pink-to-lavender primary buttons |
| `motion.transitionDuration` | `170ms` | Responsive but calm feedback |
| `motion.transitionEasing` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Soft deceleration |
| `motion.hoverScale` | `1.015` | Subtle supported hover response |

## 4. Themeable surfaces and states

- **Play:** the header carries the texture; chat, messages, composer, tabs, rail, buttons, inputs, and badges use the palette above. Primary actions are pink/lavender; active tabs use lavender; completion badges use mint.
- **Graph:** surrounding chrome, node cards, connectors, lines, text, selection, and status accents derive from the core palette. The xyflow canvas behind nodes remains fixed and is not represented as themeable.
- **Storybook:** panels, lines, text, accents, and highlights derive from the core palette.
- **Dialogs and menus:** shared `app.*` roles derive from the palette.
- **Phone apps:** Notes, ChatGPD, Banking, Gallery, Fotogram, and OnlyFriends keep their existing independent palettes.
- **Disabled:** existing RPGraph opacity and cursor behavior remains unchanged.
- **Focus, warning, and danger:** retain existing RPGraph behavior/fallbacks unless current rendered inspection identifies an unreadable combination; no new state mechanism is proposed.

## 5. Accessibility and usability checks

After implementation, measure and inspect:

- foreground against background, panels, cards, message surfaces, user bubbles, and inputs;
- primary foreground across both ends of the button gradient;
- muted labels and tab subtext at actual rendered sizes;
- active rail/tab distinction, disabled opacity, mint completion, warning, and danger;
- long roleplay passages at `13px` and `1.55` line height;
- graph lines, selected/unselected nodes, and ports against the fixed canvas;
- shadows and texture under actual compositing;
- hover scale and transitions for motion sensitivity.

These are checks, not a WCAG-conformance claim.

## 6. Mockup plan and fidelity

The companion board shows a Play-first shell with header, navigation, story output, user input, composer, status badge, swatches, and a small Graph sample. It uses the exact proposed palette and supported effect placements, but it is isolated HTML—not RPGraph—and approximates proportions and component typography.

> Concept mockup only — this is a visual direction preview, not a generated or validated RPGraph theme.

## 7. Implementation plan after approval

1. Completed: reinspected repository state, schema, resolver, consumers, and the existing id collision.
2. Completed: replaced only `resources/themes/kawaii-dream/theme.json`, preserving `id`, label, and order.
3. Completed: parsed the JSON and verified all 79 authored leaves are current core keys.
4. Completed: focused resolver/registry theme tests passed.
5. Pending separate request: load and select the theme in a live RPGraph session.
6. Pending live inspection: Play first, then representative Graph, Storybook, dialog/menu, and status states.

## 8. Acceptance criteria and limitations

- The existing folder/id convention remains correct.
- No unknown or inert keys are authored.
- Play view clearly expresses the thesis without hurting long-form reading.
- The shell no longer leaks Base cyan/blue active states.
- Graph/Storybook/app derivation remains intentional.
- Fixed canvas and independent phone apps are reported honestly.
- No source behavior, layout, or unrelated file changes occur.
- Mockup, generation, validation, and activation remain separately reported.
- Current unknowns: live rendered contrast, font fallback appearance on the target machine, graph visibility against the fixed canvas, and actual composited shadow/texture strength.
