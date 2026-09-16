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

  it('keeps new-category leaves distinct from same-named color tokens for "classic", which pins its own independent values (no --theme-panel collision)', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'classic');
    expect(resolved['--theme-panel']).toBe('#101421'); // color.panel
    expect(resolved['--theme-graph-panel']).toBe('#121625'); // graph.panel, pinned in classic/theme.json
    expect(resolved['--theme-storybook-panel']).toBe('#111625'); // storybook.panel, pinned in classic/theme.json
  });

  it('"base" (and every theme that doesn\'t pin graph/storybook explicitly) derives graph.panel/storybook.panel from color.panel instead of a fixed literal', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'base');
    expect(resolved['--theme-graph-panel']).toBe(resolved['--theme-panel']);
    expect(resolved['--theme-storybook-panel']).toBe(resolved['--theme-panel']);
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

  it('"classic" resolves the upstream global-palette aliases (app.*) to the exact original :root literals', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'classic');
    expect(resolved['--theme-app-accent']).toBe('#8a73c9');
    expect(resolved['--theme-app-surface']).toBe('#182131');
    expect(resolved['--theme-app-muted']).toBe('#9aa6bc');
    expect(resolved['--theme-app-success-soft']).toBe('rgba(95, 174, 104, 0.18)');
    expect(resolved['--theme-app-soft-white']).toBe('#e6e6e6');
  });

  it('"base" derives app.accent from color.primary instead of the original independent upstream purple', async () => {
    const manifests = await loadManifests();
    const resolved = resolveTheme(manifests, 'base');
    expect(resolved['--theme-app-accent']).toBe(resolved['--theme-primary']);
    expect(resolved['--theme-app-accent']).not.toBe('#8a73c9');
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

  it('derives graph/storybook/app tokens from each preset\'s own color.* overrides, so switching themes actually repaints Graph mode, Storybook, and the app-wide palette', async () => {
    const manifests = await loadManifests();
    const base = resolveTheme(manifests, 'base');
    const iphoneNoir = resolveTheme(manifests, 'iphone-noir');
    // iphone-noir overrides color.background/header/primary, so everything
    // derived from them should differ from base -- not silently stay frozen
    // on base's fixed graph/storybook/app defaults.
    expect(iphoneNoir['--theme-graph-background']).toBe(iphoneNoir['--theme-background']);
    expect(iphoneNoir['--theme-graph-background']).not.toBe(base['--theme-graph-background']);
    expect(iphoneNoir['--theme-storybook-background']).toBe(iphoneNoir['--theme-background']);
    expect(iphoneNoir['--theme-storybook-background']).not.toBe(base['--theme-storybook-background']);
    expect(iphoneNoir['--theme-app-accent']).toBe(iphoneNoir['--theme-primary']);
    expect(iphoneNoir['--theme-app-accent']).not.toBe(base['--theme-app-accent']);
  });

  it('derives the shared app.dialog* tokens (border/background/text) that 28+ modal dialogs in src/styles.css consume, so switching themes repaints Options, Providers, Files, System Log, and every other standard dialog at once', async () => {
    const manifests = await loadManifests();
    const base = resolveTheme(manifests, 'base');
    const iphoneNoir = resolveTheme(manifests, 'iphone-noir');
    expect(iphoneNoir['--theme-app-dialog-bg']).toBe(iphoneNoir['--theme-panel']);
    expect(iphoneNoir['--theme-app-dialog-border']).toBe(iphoneNoir['--theme-border']);
    expect(iphoneNoir['--theme-app-dialog-text']).toBe(iphoneNoir['--theme-foreground']);
    expect(iphoneNoir['--theme-app-text']).toBe(iphoneNoir['--theme-foreground']);
    expect(iphoneNoir['--theme-app-dialog-bg']).not.toBe(base['--theme-app-dialog-bg']);
  });

  it('"classic" and "studio-night" both extend base with zero color.* overrides, so their color.* tokens match, but they diverge on graph/storybook/app', async () => {
    const manifests = await loadManifests();
    const classic = resolveTheme(manifests, 'classic');
    const studioNight = resolveTheme(manifests, 'studio-night');
    expect(classic['--theme-background']).toBe(studioNight['--theme-background']);
    expect(classic['--theme-primary']).toBe(studioNight['--theme-primary']);
    expect(classic['--theme-app-accent']).not.toBe(studioNight['--theme-app-accent']);
    expect(classic['--theme-graph-panel']).not.toBe(studioNight['--theme-graph-panel']);
  });

  it('an unknown theme id falls back to the base chain without throwing', async () => {
    const manifests = await loadManifests();
    expect(() => resolveTheme(manifests, 'does-not-exist')).not.toThrow();
  });
});
