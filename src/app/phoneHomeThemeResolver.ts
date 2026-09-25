import type {
  PhoneHomeCoreTokenKey,
  PhoneHomeThemeManifest,
  PhoneHomeThemeTokenTree,
  ResolvedPhoneHomeThemeTokens,
} from './phoneHomeThemeTokens';
import {
  PHONE_HOME_CORE_TOKEN_KEYS,
  PHONE_HOME_GUARANTEED_TOKEN_KEYS,
  RESERVED_BASE_PHONE_THEME_ID,
} from './phoneHomeThemeTokens';
import { contrastingText, lighten, mix } from './themeColorMath';

/** Mirrors `flattenTree` in `themeResolver.ts` exactly. */
function flattenTree(tree: PhoneHomeThemeTokenTree | undefined, prefix: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tree) return out;
  for (const [key, value] of Object.entries(tree)) {
    if (value === undefined) continue;
    const path = [...prefix, key];
    if (typeof value === 'string') {
      out[path.join('.')] = value;
    } else {
      Object.assign(out, flattenTree(value, path));
    }
  }
  return out;
}

/** Mirrors `deepMergeTree` in `themeResolver.ts` exactly. */
function deepMergeTree(base: PhoneHomeThemeTokenTree, override: PhoneHomeThemeTokenTree | undefined): PhoneHomeThemeTokenTree {
  if (!override) return base;
  const out: PhoneHomeThemeTokenTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const existing = out[key];
    out[key] = typeof value === 'object' && existing && typeof existing === 'object'
      ? deepMergeTree(existing, value)
      : value;
  }
  return out;
}

function toKebab(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Unlike the Studio resolver's `CATEGORIES_DROPPED_FROM_VAR_NAME`, this
 * engine has a single category ("phoneHome") and it must NOT be dropped —
 * `phone-widgets.css` already consumes `--theme-phone-home-<leaf>`, keeping
 * the category segment in the name (same convention the Studio resolver
 * uses for its own non-dropped categories like `phoneBanking`/`phoneSocial`). */
function dottedPathToCssVar(dottedPath: string): string {
  return `--theme-${dottedPath.split('.').map(toKebab).join('-')}`;
}

/** Mirrors `buildChain` in `themeResolver.ts` exactly. */
function buildChain(byId: Map<string, PhoneHomeThemeManifest>, themeId: string): PhoneHomeThemeManifest[] {
  const base = byId.get(RESERVED_BASE_PHONE_THEME_ID);
  const chain: PhoneHomeThemeManifest[] = [];
  const seen = new Set<string>();
  let current = byId.get(themeId) ?? base;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    if (current.id === RESERVED_BASE_PHONE_THEME_ID) break;
    current = current.extends ? byId.get(current.extends) : base;
  }
  if (chain[0]?.id !== RESERVED_BASE_PHONE_THEME_ID && base) chain.unshift(base);
  return chain;
}

type DerivationRule = (basic: Record<string, string>, resolved: Record<string, string>) => string | undefined;

/** Fills gaps left after the `extends` merge, using the Basic tier. Mirrors
 * the shape of `DERIVATION_RULES` in `themeResolver.ts`, scaled down to this
 * engine's much smaller token set — every token here can plausibly derive
 * from just `primary` (the accent family) or `background` (the scrim/clock/
 * widget/label family), so unlike the Studio engine's near-empty derivation
 * hook, this one is small but fully populated from the start. A theme.json-
 * style advanced `tokens` entry always wins over a derived value (derivation
 * only fills a token still unset after the `extends` merge — see the loop in
 * `resolvePhoneHomeTheme` below). */
const DERIVATION_RULES: Partial<Record<PhoneHomeCoreTokenKey, DerivationRule>> = {
  'phoneHome.accent': (basic) => basic.primary,
  'phoneHome.accentStrong': (basic, resolved) =>
    resolved['phoneHome.accent'] !== undefined
      ? mix(resolved['phoneHome.accent'], '#000000', 0.4)
      : basic.primary,
  'phoneHome.badge': (_basic, resolved) => resolved['phoneHome.accent'],
  'phoneHome.badgeBanking': (_basic, resolved) => resolved['phoneHome.accentStrong'],
  'phoneHome.scrim': (basic) => basic.background,
  'phoneHome.clockBackground': (basic) => basic.background,
  'phoneHome.widgetBackground': (basic) => basic.background,
  'phoneHome.clockText': (_basic, resolved) =>
    resolved['phoneHome.clockBackground'] !== undefined
      ? contrastingText(resolved['phoneHome.clockBackground'])
      : undefined,
  'phoneHome.label': (_basic, resolved) => resolved['phoneHome.clockText'],
  'phoneHome.online': (basic) =>
    basic.background !== undefined ? lighten(basic.background, 60) : undefined,
};

/** Resolves a phone-home theme id against the loaded manifest registry into
 * a flat map of `--theme-phone-home-*` CSS custom property names to string
 * values, ready for `element.style.setProperty`. Pure — no DOM/IO. Mirrors
 * `resolveTheme` in `themeResolver.ts` precedence exactly:
 *
 *  1. `base` theme's explicit tokens (exhaustive safety net).
 *  2. Basic-to-advanced derivation (only fills gaps left after step 3).
 *  3. `extends`-chain merge of `tokens`, root ancestor first, requested
 *     theme's own tokens last (highest-priority explicit value). */
export function resolvePhoneHomeTheme(
  manifests: PhoneHomeThemeManifest[],
  themeId: string,
): ResolvedPhoneHomeThemeTokens {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest] as const));
  const base = byId.get(RESERVED_BASE_PHONE_THEME_ID);
  const chain = buildChain(byId, themeId);

  const basic: Record<string, string> = {};
  for (const manifest of chain) Object.assign(basic, manifest.basic ?? {});

  let advancedTree: PhoneHomeThemeTokenTree = {};
  for (const manifest of chain) advancedTree = deepMergeTree(advancedTree, manifest.tokens);
  const resolved = flattenTree(advancedTree);

  for (const key of PHONE_HOME_CORE_TOKEN_KEYS) {
    if (resolved[key] !== undefined) continue;
    const derived = DERIVATION_RULES[key]?.(basic, resolved);
    if (derived !== undefined) resolved[key] = derived;
  }

  const baseFlat = base ? flattenTree(base.tokens) : {};
  for (const key of PHONE_HOME_GUARANTEED_TOKEN_KEYS) {
    if (resolved[key] === undefined && baseFlat[key] !== undefined) {
      resolved[key] = baseFlat[key];
    }
  }

  const output: ResolvedPhoneHomeThemeTokens = {};
  for (const [dottedPath, value] of Object.entries(resolved)) {
    output[dottedPathToCssVar(dottedPath)] = value;
  }
  return output;
}

/** Dev-only advisory check: warns when a *guaranteed* token has no value in
 * `base` — mirrors `missingCoreTokensInBase` in `themeResolver.ts`. */
export function missingCoreTokensInPhoneHomeBase(manifests: PhoneHomeThemeManifest[]): PhoneHomeCoreTokenKey[] {
  const base = manifests.find((manifest) => manifest.id === RESERVED_BASE_PHONE_THEME_ID);
  if (!base) return [...PHONE_HOME_GUARANTEED_TOKEN_KEYS];
  const flat = flattenTree(base.tokens);
  return PHONE_HOME_GUARANTEED_TOKEN_KEYS.filter((key) => !flat[key]);
}
