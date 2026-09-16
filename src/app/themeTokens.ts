/** Dotted-path core token keys, grouped by category. Extend this list as new
 * categories/tokens get consumed by CSS during this or future migrations.
 * Unknown/custom keys authored in a theme.json are still legal and get
 * flattened into CSS custom properties — this list only drives IDE
 * autocomplete and the "every core token resolves" regression test. */
export const CORE_TOKEN_KEYS = [
  // color (semantic, shadcn-style)
  'color.background',
  'color.backgroundElevated',
  'color.header',
  'color.surfaceRail',
  'color.surfaceContent',
  'color.panel',
  'color.card',
  'color.cardStrong',
  'color.input',
  'color.foreground',
  'color.mutedForeground',
  'color.primary',
  'color.primaryForeground',
  'color.secondary',
  'color.border',
  'color.borderSoft',
  'color.userBubble',
  'color.userBubbleBorder',
  'color.rail',
  'color.complete',
  'color.phoneGlass',
  // graph mode
  'graph.background',
  'graph.chrome',
  'graph.panel',
  'graph.panel2',
  'graph.line',
  'graph.lineSoft',
  'graph.text',
  'graph.muted',
  'graph.faint',
  'graph.accent',
  'graph.accentSoft',
  'graph.success',
  'graph.violet',
  // storybook editor
  'storybook.background',
  'storybook.panel',
  'storybook.passive',
  'storybook.line',
  'storybook.lineSoft',
  'storybook.text',
  'storybook.muted',
  'storybook.faint',
  'storybook.accent',
  'storybook.accentSoft',
  'storybook.violet',
  'storybook.violetSoft',
  'storybook.pink',
  'storybook.lime',
  // studio shell chrome (play-mode composer/rail/tabs that don't fit an
  // existing semantic color slot -- see studio-shell.css)
  'shell.chatSurface',
  'shell.messageBorder',
  'shell.messageText',
  'shell.labelStrong',
  'shell.inputBorder',
  'shell.segmentedBg',
  'shell.iconColor',
  'shell.iconButtonBg',
  'shell.autoTurnText',
  'shell.railBorder',
  'shell.characterStripBg',
  'shell.railActiveColor',
  'shell.railActiveBorder',
  'shell.railActiveBg',
  'shell.badgeBorder',
  'shell.badgeText',
  'shell.badgeBg',
  'shell.badgeGlow',
  'shell.tabBorder',
  'shell.tabBorderBottom',
  'shell.tabText',
  'shell.tabBg',
  'shell.tabActiveBorder',
  'shell.tabActiveBg',
  'shell.tabActiveText',
  'shell.tabSubtext',
  'shell.topbarButtonBorder',
  'shell.topbarButtonText',
  'shell.topbarButtonBg',
  'shell.topbarHoverBg',
  'shell.topbarHoverBorder',
  'shell.badgeAccentBg',
  'shell.topbarContextBorder',
  'shell.topbarMutedText',
  'shell.topbarSelectBg',
  // upstream's own global palette (:root in src/styles.css, predates the
  // theme system) -- aliased on .studio so the ~400 existing var(--accent)/
  // var(--surface)/etc. references throughout styles.css pick up the
  // active theme without editing each of those rules individually
  'app.accent',
  'app.accentLight',
  'app.surface',
  'app.surfaceAlt',
  'app.surfaceSoft',
  'app.line',
  'app.muted',
  'app.cyan',
  'app.wire',
  'app.success',
  'app.successSoft',
  'app.warning',
  'app.warningSoft',
  'app.danger',
  'app.dangerSoft',
  'app.softWhite',
  // typography
  'typography.headingFont',
  'typography.bodyFont',
  'typography.fontWeight',
  'typography.fontWeightHeading',
  'typography.letterSpacing',
  'typography.textTransform',
  'typography.baseSize',
  'typography.lineHeight',
  // shape
  'shape.radius',
  'shape.radiusCard',
  'shape.radiusButton',
  'shape.radiusInput',
  'shape.borderWidth',
  'shape.borderStyle',
  'shape.clipPath',
  // effect
  'effect.cardShadow',
  'effect.buttonShadow',
  'effect.buttonShadowHover',
  'effect.accentGlow',
  'effect.backgroundTexture',
  'effect.buttonBackground',
  // motion
  'motion.transitionDuration',
  'motion.transitionEasing',
  'motion.hoverScale',
] as const;

export type CoreTokenKey = (typeof CORE_TOKEN_KEYS)[number];

/** The subset of core tokens that must always resolve to *some* value: they
 * have no CSS-level `var(x, fallback)` in the consuming stylesheet (or their
 * only sensible fallback would itself be a per-theme value), so the resolver
 * force-backfills them from the `base` theme when nothing else provides one.
 *
 * Every other core token is intentionally left unset when neither the
 * `extends` chain nor basic-tier derivation supplies a value — the
 * consuming CSS already carries its own fallback (e.g.
 * `var(--theme-radius-card, var(--theme-radius))`), and force-backfilling
 * it from `base` would defeat that per-theme fallback (every theme would
 * silently get base's own radius instead of its own). */
export const GUARANTEED_TOKEN_KEYS = [
  'color.background', 'color.backgroundElevated', 'color.header',
  'color.surfaceRail', 'color.surfaceContent', 'color.panel', 'color.card', 'color.cardStrong',
  'color.input', 'color.foreground', 'color.mutedForeground',
  'color.primary', 'color.primaryForeground', 'color.secondary',
  'color.border', 'color.borderSoft',
  'color.userBubble', 'color.userBubbleBorder',
  'color.rail', 'color.complete', 'color.phoneGlass',
  'graph.background', 'graph.chrome', 'graph.panel', 'graph.panel2',
  'graph.line', 'graph.lineSoft', 'graph.text', 'graph.muted', 'graph.faint',
  'graph.accent', 'graph.accentSoft', 'graph.success', 'graph.violet',
  'storybook.background', 'storybook.panel', 'storybook.passive',
  'storybook.line', 'storybook.lineSoft', 'storybook.text', 'storybook.muted',
  'storybook.faint', 'storybook.accent', 'storybook.accentSoft',
  'storybook.violet', 'storybook.violetSoft', 'storybook.pink', 'storybook.lime',
  'shell.chatSurface', 'shell.messageBorder', 'shell.messageText', 'shell.labelStrong',
  'shell.inputBorder', 'shell.segmentedBg', 'shell.iconColor', 'shell.iconButtonBg',
  'shell.autoTurnText', 'shell.railBorder', 'shell.characterStripBg',
  'shell.railActiveColor', 'shell.railActiveBorder', 'shell.railActiveBg',
  'shell.badgeBorder', 'shell.badgeText', 'shell.badgeBg', 'shell.badgeGlow',
  'shell.tabBorder', 'shell.tabBorderBottom', 'shell.tabText', 'shell.tabBg',
  'shell.tabActiveBorder', 'shell.tabActiveBg', 'shell.tabActiveText', 'shell.tabSubtext',
  'shell.topbarButtonBorder', 'shell.topbarButtonText', 'shell.topbarButtonBg',
  'shell.topbarHoverBg', 'shell.topbarHoverBorder', 'shell.badgeAccentBg',
  'shell.topbarContextBorder', 'shell.topbarMutedText', 'shell.topbarSelectBg',
  'app.accent', 'app.accentLight', 'app.surface', 'app.surfaceAlt', 'app.surfaceSoft',
  'app.line', 'app.muted', 'app.cyan', 'app.wire', 'app.success', 'app.successSoft',
  'app.warning', 'app.warningSoft', 'app.danger', 'app.dangerSoft', 'app.softWhite',
  'typography.fontWeight',
  'shape.radius',
] as const satisfies readonly CoreTokenKey[];

/** Nested dotted-object JSON shape theme authors write; leaves are raw CSS
 * value strings (a color, a full box-shadow, a full clip-path polygon) —
 * no {value, unit} tagged objects, so exotic themes can hold complete CSS
 * expressions (gradients, clip-paths) in a single token. */
export type ThemeTokenTree = { [key: string]: string | ThemeTokenTree | undefined };

/** Open dictionary: any dotted key is legal; known CORE keys get
 * autocompletion + type-checked values, unknown ones still type-check
 * (open-world model — required so future file-by-file CSS migrations can
 * introduce new token names without changing this file). */
type CoreTokens = Partial<Record<CoreTokenKey, string>>;
type ThemeTokenDictionary = CoreTokens & Record<string, string | ThemeTokenTree | undefined>;

/** The small set of knobs the theme picker/editor exposes via simple
 * pickers. When an advanced token is unset, the resolver derives a sensible
 * value from these before falling back to the base theme. */
type ThemeBasicTokens = {
  primary?: string;
  secondary?: string;
  background?: string;
  foreground?: string;
  headingFont?: string;
  bodyFont?: string;
  radius?: string;
};

export interface ThemeManifest {
  /** Folder name / stable identifier, e.g. "iphone-noir". */
  id: string;
  label: string;
  /** Parent theme id. Defaults to "base" when omitted, except for "base" itself. */
  extends?: string;
  /** True only for "base" — excluded from the theme picker. */
  hidden?: boolean;
  /** Picker display order, ascending. Themes without one sort after themes
   * that have one, alphabetically among themselves. */
  order?: number;
  basic?: ThemeBasicTokens;
  /** Nested-dotted "advanced" tier; always wins over a derived value. */
  tokens?: ThemeTokenDictionary;
  /** Where this manifest was discovered: a bundled preset that ships with
   * the app (read-only), or a user-authored theme dropped into the
   * per-user themes folder. Set by the loader, not authored in the JSON
   * file itself — a hand-authored theme.json never needs this field. */
  source?: 'bundled' | 'user';
}

/** Fully flattened, resolved output — every value is a plain string ready
 * for `element.style.setProperty`, keyed by the hyphenated CSS custom
 * property name. */
export type ResolvedThemeTokens = Record<string, string>;

export const RESERVED_BASE_THEME_ID = 'base';
