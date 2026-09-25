import { describe, expect, it } from 'vitest';
import { browserPhoneHomeThemeLibrarySnapshot } from './phoneHomeThemeLibrary.browser';
import { missingCoreTokensInPhoneHomeBase, resolvePhoneHomeTheme } from './phoneHomeThemeResolver';
import { PHONE_HOME_GUARANTEED_TOKEN_KEYS, type PhoneHomeThemeManifest } from './phoneHomeThemeTokens';

async function loadManifests(): Promise<PhoneHomeThemeManifest[]> {
  const snapshot = await browserPhoneHomeThemeLibrarySnapshot();
  return snapshot.manifests;
}

describe('phone-home theme resolution', () => {
  it('ships exactly base + classic + hardcore + calm + mono', async () => {
    const manifests = await loadManifests();
    expect(manifests.map((manifest) => manifest.id).sort()).toEqual(['base', 'calm', 'classic', 'hardcore', 'mono']);
  });

  it('base theme alone already satisfies every core token', async () => {
    const manifests = await loadManifests();
    expect(missingCoreTokensInPhoneHomeBase(manifests)).toEqual([]);
  });

  it('every shipped theme resolves every guaranteed token to a non-empty value, at the exact --theme-phone-home-* var name phone-widgets.css consumes', async () => {
    const manifests = await loadManifests();
    for (const manifest of manifests) {
      const resolved = resolvePhoneHomeTheme(manifests, manifest.id);
      for (const key of PHONE_HOME_GUARANTEED_TOKEN_KEYS) {
        const cssVar = `--theme-${key.split('.').map((s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()).join('-')}`;
        expect(cssVar.startsWith('--theme-phone-home-')).toBe(true);
        expect(resolved[cssVar], `theme "${manifest.id}" is missing ${cssVar} (from ${key})`).toBeTruthy();
      }
    }
  });

  it('classic resolves its own designed palette, not a derived one', async () => {
    const manifests = await loadManifests();
    const classic = resolvePhoneHomeTheme(manifests, 'classic');
    expect(classic['--theme-phone-home-scrim']).toBe('#050710');
    expect(classic['--theme-phone-home-accent']).toBe('#79d8ef');
    expect(classic['--theme-phone-home-accent-strong']).toBe('#a277ff');
    expect(classic['--theme-phone-home-clock-background']).toBe('#101421');
    expect(classic['--theme-phone-home-clock-text']).toBe('#f4f7ff');
    expect(classic['--theme-phone-home-widget-background']).toBe('#101421');
    expect(classic['--theme-phone-home-label']).toBe('#f4f7ff');
    expect(classic['--theme-phone-home-badge']).toBe('#f15bb5');
    expect(classic['--theme-phone-home-badge-banking']).toBe('#ff6b6b');
    expect(classic['--theme-phone-home-online']).toBe('#68e08e');
  });

  it('hardcore and calm resolve their own designed palettes', async () => {
    const manifests = await loadManifests();
    const hardcore = resolvePhoneHomeTheme(manifests, 'hardcore');
    expect(hardcore['--theme-phone-home-scrim']).toBe('#040302');
    expect(hardcore['--theme-phone-home-accent']).toBe('#ff7626');
    expect(hardcore['--theme-phone-home-online']).toBe('#e7ff28');

    const calm = resolvePhoneHomeTheme(manifests, 'calm');
    expect(calm['--theme-phone-home-scrim']).toBe('#020203');
    expect(calm['--theme-phone-home-accent']).toBe('#d8dde3');
    expect(calm['--theme-phone-home-badge-banking']).toBe('#92b89b');
  });

  it('shape tokens are guaranteed: classic inherits base geometry, hardcore/calm/mono each set their own', async () => {
    const manifests = await loadManifests();
    const classic = resolvePhoneHomeTheme(manifests, 'classic');
    expect(classic['--theme-phone-home-icon-radius']).toBe('28%');
    expect(classic['--theme-phone-home-card-radius']).toBe('20px');

    const hardcore = resolvePhoneHomeTheme(manifests, 'hardcore');
    expect(hardcore['--theme-phone-home-icon-radius']).toBe('12%');
    expect(hardcore['--theme-phone-home-card-radius']).toBe('6px');

    const calm = resolvePhoneHomeTheme(manifests, 'calm');
    expect(calm['--theme-phone-home-icon-radius']).toBe('34%');
    expect(calm['--theme-phone-home-card-radius']).toBe('26px');

    const mono = resolvePhoneHomeTheme(manifests, 'mono');
    expect(mono['--theme-phone-home-icon-radius']).toBe('10%');
    expect(mono['--theme-phone-home-card-radius']).toBe('4px');
  });

  it('icon coloring is optional: unset for classic/hardcore/calm, set (monochrome) for mono', async () => {
    const manifests = await loadManifests();
    for (const id of ['classic', 'hardcore', 'calm']) {
      const resolved = resolvePhoneHomeTheme(manifests, id);
      expect(resolved['--theme-phone-home-icon-background']).toBeUndefined();
      expect(resolved['--theme-phone-home-icon-border']).toBeUndefined();
    }
    const mono = resolvePhoneHomeTheme(manifests, 'mono');
    expect(mono['--theme-phone-home-icon-background']).toBe('rgba(232, 232, 236, 0.14)');
    expect(mono['--theme-phone-home-icon-border']).toBe('rgba(232, 232, 236, 0.38)');
  });

  it('an unknown theme id falls back to base', async () => {
    const manifests = await loadManifests();
    const unknown = resolvePhoneHomeTheme(manifests, 'does-not-exist');
    const base = resolvePhoneHomeTheme(manifests, 'base');
    expect(unknown).toEqual(base);
  });
});
