import { describe, expect, it } from 'vitest';
import { browserThemeLibrarySnapshot } from './themeLibrary.browser';
import { missingCoreTokensInBase, resolveTheme } from './themeResolver';
import { GUARANTEED_TOKEN_KEYS, type ThemeManifest } from './themeTokens';

async function loadManifests(): Promise<ThemeManifest[]> {
  const snapshot = await browserThemeLibrarySnapshot();
  return snapshot.manifests;
}

describe('theme resolution', () => {
  it('base theme alone (no extends, no derivation) already satisfies every core token', async () => {
    const manifests = await loadManifests();
    expect(missingCoreTokensInBase(manifests)).toEqual([]);
  });

  it('every shipped theme resolves every guaranteed token to a non-empty value', async () => {
    const manifests = await loadManifests();
    for (const manifest of manifests) {
      const resolved = resolveTheme(manifests, manifest.id);
      for (const key of GUARANTEED_TOKEN_KEYS) {
        const segments = key.split('.');
        const category = segments[0];
        const withoutCategory = ['color', 'typography', 'shape', 'effect', 'motion'].includes(category)
          ? segments.slice(1)
          : segments;
        const cssVar = `--theme-${withoutCategory.map((s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()).join('-')}`;
        expect(resolved[cssVar], `theme "${manifest.id}" is missing ${cssVar} (from ${key})`).toBeTruthy();
      }
    }
  });

  it('studio-night extends base with zero overrides and resolves identically to base', async () => {
    const manifests = await loadManifests();
    const studioNight = resolveTheme(manifests, 'studio-night');
    const base = resolveTheme(manifests, 'base');
    expect(studioNight).toEqual(base);
  });

  it('iphone-noir overrides only its declared deltas and falls back to base for the rest', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'iphone-noir');
    expect(resolved['--theme-background']).toBe('#02030a');
    expect(resolved['--theme-radius']).toBe('12px');
    // Not redeclared by iphone-noir's theme.json -- must fall through to base.
    expect(resolved['--theme-secondary']).toBe('#f15bb5');
    expect(resolved['--theme-complete']).toBe('#68e08e');
  });

  it('keeps new-category leaves distinct from same-named color tokens (no --theme-panel collision)', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'base');
    expect(resolved['--theme-panel']).toBe('#101421'); // color.panel
    expect(resolved['--theme-graph-panel']).toBe('#121625'); // graph.panel
    expect(resolved['--theme-storybook-panel']).toBe('#111625'); // storybook.panel
  });

  it('resolves the new studio-shell/topbar tokens to the exact literals the CSS used before migration', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'base');
    expect(resolved['--theme-shell-chat-surface']).toBe('#0a0d18');
    expect(resolved['--theme-shell-message-border']).toBe('rgba(77, 96, 138, 0.58)');
    expect(resolved['--theme-shell-rail-active-bg']).toBe('rgba(126, 225, 247, 0.1)');
    expect(resolved['--theme-shell-badge-bg']).toBe('#76e581');
    expect(resolved['--theme-shell-topbar-button-bg']).toBe('#10131f');
    expect(resolved['--theme-shell-badge-accent-bg']).toBe('#fb7185');
  });

  it('resolves the upstream global-palette aliases (app.*) to the exact original :root literals', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'base');
    expect(resolved['--theme-app-accent']).toBe('#8a73c9');
    expect(resolved['--theme-app-surface']).toBe('#182131');
    expect(resolved['--theme-app-muted']).toBe('#9aa6bc');
    expect(resolved['--theme-app-success-soft']).toBe('rgba(95, 174, 104, 0.18)');
    expect(resolved['--theme-app-soft-white']).toBe('#e6e6e6');
  });

  it('leaves auto-extracted raw.* tokens unresolved by default (CSS var() fallback governs them, not the resolver)', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'base');
    // Optional tier: no theme sets these, so they should be absent from the
    // resolved output entirely -- the literal baked into each consuming
    // declaration's var(--theme-raw-x, <literal>) is what renders by default.
    expect(resolved['--theme-raw-vedf1ff']).toBeUndefined();
    expect(resolved['--theme-raw-v232d42']).toBeUndefined();
  });

  it('an unknown theme id falls back to the base chain without throwing', async () => {
    const manifests = await loadManifests();
    expect(() => resolveTheme(manifests, 'does-not-exist')).not.toThrow();
  });
});
