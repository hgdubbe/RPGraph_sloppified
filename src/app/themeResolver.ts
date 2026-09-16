import type {
  CoreTokenKey,
  ResolvedThemeTokens,
  ThemeManifest,
  ThemeTokenTree,
} from './themeTokens';
import { CORE_TOKEN_KEYS, GUARANTEED_TOKEN_KEYS, RESERVED_BASE_THEME_ID } from './themeTokens';
import { contrastingText, lighten, mix, withAlpha } from './themeColorMath';

function flattenTree(tree: ThemeTokenTree | undefined, prefix: string[] = []): Record<string, string> {
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

function deepMergeTree(base: ThemeTokenTree, override: ThemeTokenTree | undefined): ThemeTokenTree {
  if (!override) return base;
  const out: ThemeTokenTree = { ...base };
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

/** The five original categories are organizational-only and get dropped
 * from the compiled CSS variable name (kept for backward-compatible names
 * like "color.background" -> "--theme-background"). Any category added
 * since (e.g. "graph", "storybook") keeps its segment in the name instead,
 * since dropping it would collide with same-named leaves in other
 * categories -- "graph.panel" and "color.panel" must not both become
 * "--theme-panel". */
const CATEGORIES_DROPPED_FROM_VAR_NAME = new Set(['color', 'typography', 'shape', 'effect', 'motion']);

/** Kebab-joins a dotted token path into its compiled CSS variable name, e.g.
 * "shape.radiusCard" -> "--theme-radius-card", "color.background" ->
 * "--theme-background", "graph.background" -> "--theme-graph-background". */
function dottedPathToCssVar(dottedPath: string): string {
  const segments = dottedPath.split('.');
  const category = segments[0];
  const withoutCategory = segments.length > 1 && CATEGORIES_DROPPED_FROM_VAR_NAME.has(category)
    ? segments.slice(1)
    : segments;
  return `--theme-${withoutCategory.map(toKebab).join('-')}`;
}

/** Builds the `extends` ancestry root-first; `base` is always chain[0].
 * Cycle-guarded (a theme that accidentally extends itself/a loop stops
 * rather than hanging). */
function buildChain(byId: Map<string, ThemeManifest>, themeId: string): ThemeManifest[] {
  const base = byId.get(RESERVED_BASE_THEME_ID);
  const chain: ThemeManifest[] = [];
  const seen = new Set<string>();
  let current = byId.get(themeId) ?? base;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    if (current.id === RESERVED_BASE_THEME_ID) break;
    current = current.extends ? byId.get(current.extends) : base;
  }
  if (chain[0]?.id !== RESERVED_BASE_THEME_ID && base) chain.unshift(base);
  return chain;
}

type DerivationRule = (basic: Record<string, string>, resolved: Record<string, string>) => string | undefined;

/** Fills gaps left after the `extends` merge, using the Basic tier the theme
 * picker/editor writes. Order matters: a rule may read an already-resolved
 * dependency from `resolved` only if that dependency's own CORE_TOKEN_KEYS
 * entry appears earlier in the array below. */
const DERIVATION_RULES: Partial<Record<CoreTokenKey, DerivationRule>> = {
  'color.background': (basic) => basic.background,
  'color.foreground': (basic) => basic.foreground,
  'color.primary': (basic) => basic.primary,
  'color.secondary': (basic) => basic.secondary,
  'color.panel': (basic) => (basic.background !== undefined ? lighten(basic.background, 4) : undefined),
  'color.card': (basic) => (basic.background !== undefined ? lighten(basic.background, 6) : undefined),
  'color.cardStrong': (_basic, resolved) =>
    resolved['color.card'] !== undefined ? lighten(resolved['color.card'], 8) : undefined,
  'color.mutedForeground': (basic, resolved) =>
    basic.foreground !== undefined && resolved['color.background'] !== undefined
      ? mix(basic.foreground, resolved['color.background'], 0.45)
      : undefined,
  'color.border': (_basic, resolved) =>
    resolved['color.foreground'] !== undefined ? withAlpha(resolved['color.foreground'], 0.15) : undefined,
  'color.primaryForeground': (_basic, resolved) =>
    resolved['color.primary'] !== undefined ? contrastingText(resolved['color.primary']) : undefined,
  'typography.headingFont': (basic) => basic.headingFont,
  'typography.bodyFont': (basic) => basic.bodyFont,
  'shape.radius': (basic) => basic.radius,
};

/** Resolves a theme id against the loaded manifest registry into a flat map
 * of `--theme-*` CSS custom property names to string values, ready for
 * `element.style.setProperty`. Pure — no DOM/IO.
 *
 * Precedence, lowest to highest:
 *  1. `base` theme's explicit tokens (exhaustive safety net).
 *  2. Basic-to-advanced derivation (only fills gaps left after step 3).
 *  3. `extends`-chain merge of `tokens`, root ancestor first, requested
 *     theme's own tokens last (highest-priority explicit value). */
export function resolveTheme(manifests: ThemeManifest[], themeId: string): ResolvedThemeTokens {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest] as const));
  const base = byId.get(RESERVED_BASE_THEME_ID);
  const chain = buildChain(byId, themeId);

  const basic: Record<string, string> = {};
  for (const manifest of chain) Object.assign(basic, manifest.basic ?? {});

  let advancedTree: ThemeTokenTree = {};
  for (const manifest of chain) advancedTree = deepMergeTree(advancedTree, manifest.tokens);
  const resolved = flattenTree(advancedTree);

  // Derivation may apply to any known core token (this is what lets a
  // basic-tier-only theme still get a coherent card/border/font even for
  // tokens not in the guaranteed set).
  for (const key of CORE_TOKEN_KEYS) {
    if (resolved[key] !== undefined) continue;
    const derived = DERIVATION_RULES[key]?.(basic, resolved);
    if (derived !== undefined) resolved[key] = derived;
  }

  // Only the guaranteed subset gets force-backfilled from `base` -- every
  // other still-unset token stays absent so the CSS's own
  // `var(--theme-x, <per-theme-fallback>)` governs it instead.
  const baseFlat = base ? flattenTree(base.tokens) : {};
  for (const key of GUARANTEED_TOKEN_KEYS) {
    if (resolved[key] === undefined && baseFlat[key] !== undefined) {
      resolved[key] = baseFlat[key];
    }
  }

  const output: ResolvedThemeTokens = {};
  for (const [dottedPath, value] of Object.entries(resolved)) {
    output[dottedPathToCssVar(dottedPath)] = value;
  }
  return output;
}

/** Dev-only advisory check: warns when a *guaranteed* token has no value in
 * `base` — that's a bug in `base` itself, since every theme ultimately
 * falls back to it for these. Deliberately does not check the rest of
 * CORE_TOKEN_KEYS: those are optional-by-design (the consuming CSS carries
 * its own `var(x, fallback)`), so `base` intentionally leaves some of them
 * unset rather than leaking a fixed value into every theme that extends it. */
export function missingCoreTokensInBase(manifests: ThemeManifest[]): CoreTokenKey[] {
  const base = manifests.find((manifest) => manifest.id === RESERVED_BASE_THEME_ID);
  if (!base) return [...GUARANTEED_TOKEN_KEYS];
  const flat = flattenTree(base.tokens);
  return GUARANTEED_TOKEN_KEYS.filter((key) => !flat[key]);
}
