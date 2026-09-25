/** Token types for the phone's own OS-chrome theme engine — a second, fully
 * independent instance of the same architecture as `themeTokens.ts`, scoped
 * to just the phone's home screen ("OS chrome": wallpaper scrim, clock
 * widget, desktop widgets, app-icon labels, notification badges, the
 * mood-status dot, the bottom favorites dock). See
 * `resources/themes/PHONE-HOME-THEME-INTERNALS.md` for the full
 * architecture writeup and how this relates to the two other theming
 * systems in this app (the Studio theme, and the theme.json-authored
 * `phoneHome.*` token namespace consumed by the same file this engine
 * targets, `src/styles/phone-widgets.css`). */

/** Dotted-path core token keys. Single category (`phoneHome`), one leaf per
 * `--theme-phone-home-<kebab-leaf>` custom property already consumed by
 * `src/styles/phone-widgets.css` — grep that file for `--theme-phone-home-`
 * to re-verify this list against the actual CSS if it ever drifts. */
export const PHONE_HOME_CORE_TOKEN_KEYS = [
  'phoneHome.scrim',
  'phoneHome.accent',
  'phoneHome.accentStrong',
  'phoneHome.clockBackground',
  'phoneHome.clockText',
  'phoneHome.widgetBackground',
  'phoneHome.label',
  'phoneHome.badge',
  'phoneHome.badgeBanking',
  'phoneHome.online',
  // Shape: corner geometry for the icon grid and for the clock/widget/dock
  // cards. Guaranteed (see below) — every theme resolves a real radius, not
  // a CSS-literal fallback, so "sharp-cornered" is a genuine per-theme knob.
  'phoneHome.iconRadius',
  'phoneHome.cardRadius',
  // Icon coloring: OPTIONAL (not guaranteed, no `base` entry — see below).
  // Unset, each app icon keeps its own hand-picked glass tint exactly as
  // shipped. Set, every icon — regardless of which app — flattens to this
  // one background/border, because the same two custom properties feed all
  // nine icon selectors in phone-widgets.css. This is what makes a
  // monochrome phone theme possible without hand-authoring nine overrides.
  'phoneHome.iconBackground',
  'phoneHome.iconBorder',
] as const;

export type PhoneHomeCoreTokenKey = (typeof PHONE_HOME_CORE_TOKEN_KEYS)[number];

/** Everything except the two icon-coloring leaves is guaranteed:
 * `phone-widgets.css`'s own `var(--theme-phone-home-x, <literal>)`
 * fallbacks already cover the "nothing set anything" case, but the resolver
 * still force-backfills these from `base` (mirroring `themeResolver.ts`'s
 * GUARANTEED_TOKEN_KEYS split) so every non-base manifest resolves a
 * complete, self-consistent palette rather than silently mixing in CSS
 * literal fallbacks alongside a few overridden tokens.
 *
 * `iconBackground`/`iconBorder` are the one deliberate exception, mirroring
 * the same guaranteed-vs-optional split `themeResolver.ts` uses for e.g.
 * `shape.radiusCard` (see THEMING-INTERNALS.md gotcha #1): there is no
 * sensible *single* universal default for "the flat color every app icon
 * should share," because the correct default is "don't flatten them at
 * all" — nine different, per-app CSS literal fallbacks already express
 * exactly that in `phone-widgets.css`. Putting a fixed value in `base`
 * here would pre-empt that per-app fallback for every theme that doesn't
 * explicitly opt in, which is the opposite of what this leaf is for. */
export const PHONE_HOME_GUARANTEED_TOKEN_KEYS = PHONE_HOME_CORE_TOKEN_KEYS.filter(
  (key): key is Exclude<PhoneHomeCoreTokenKey, 'phoneHome.iconBackground' | 'phoneHome.iconBorder'> =>
    key !== 'phoneHome.iconBackground' && key !== 'phoneHome.iconBorder',
) as readonly Exclude<PhoneHomeCoreTokenKey, 'phoneHome.iconBackground' | 'phoneHome.iconBorder'>[];

/** Nested dotted-object JSON shape theme authors write; leaves are raw CSS
 * value strings. Mirrors `ThemeTokenTree` in `themeTokens.ts`. */
export type PhoneHomeThemeTokenTree = { [key: string]: string | PhoneHomeThemeTokenTree | undefined };

type PhoneHomeCoreTokens = Partial<Record<PhoneHomeCoreTokenKey, string>>;
type PhoneHomeThemeTokenDictionary = PhoneHomeCoreTokens & Record<string, string | PhoneHomeThemeTokenTree | undefined>;

/** The small set of knobs a future simple picker/editor could expose. The
 * token set here is small enough that a `primary`/`background` pair covers
 * it plausibly (accent-family tokens derive from `primary`, background-ish
 * tokens derive from `background`) — see `DERIVATION_RULES` in
 * `phoneHomeThemeResolver.ts`. */
type PhoneHomeThemeBasicTokens = {
  primary?: string;
  background?: string;
};

export interface PhoneHomeThemeManifest {
  /** Folder name / stable identifier, e.g. "hardcore". */
  id: string;
  label: string;
  /** Parent theme id. Defaults to "base" when omitted, except for "base" itself. */
  extends?: string;
  /** True only for "base" — excluded from the theme picker. */
  hidden?: boolean;
  /** Picker display order, ascending. Themes without one sort after themes
   * that have one, alphabetically among themselves. */
  order?: number;
  basic?: PhoneHomeThemeBasicTokens;
  /** Nested-dotted "advanced" tier; always wins over a derived value. */
  tokens?: PhoneHomeThemeTokenDictionary;
  /** Where this manifest was discovered — set by the loader, not authored
   * in the JSON file itself. See `ThemeManifest['source']`. */
  source?: 'bundled' | 'user';
}

/** Fully flattened, resolved output — every value is a plain string ready
 * for `element.style.setProperty`, keyed by the hyphenated CSS custom
 * property name. */
export type ResolvedPhoneHomeThemeTokens = Record<string, string>;

export const RESERVED_BASE_PHONE_THEME_ID = 'base';
