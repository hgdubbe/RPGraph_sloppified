import { describe, expect, it } from 'vitest';
import { browserThemeLibrarySnapshot } from './themeLibrary.browser';
import { selectableThemes, studioThemeStorageKey } from './themeRegistry';

describe('studioTheme (registry-backed)', () => {
  it('uses a stable localStorage key', () => {
    expect(studioThemeStorageKey).toBe('rpgraph.studioTheme');
  });

  it('loads the bundled presets, hiding only the internal base fallback', async () => {
    const snapshot = await browserThemeLibrarySnapshot();
    const selectable = selectableThemes(snapshot.manifests);
    expect(selectable.some((theme) => theme.id === 'base')).toBe(false);
    expect(selectable.map((theme) => theme.id)).toEqual(
      expect.arrayContaining([
        'studio-night',
        'iphone-noir',
        'neon-social',
        'rainy-window',
        'kawaii-dream',
        'terminal-green',
        'cute-girly',
        'goth',
        'hardcore',
        'normal-guy',
      ]),
    );
    for (const theme of snapshot.manifests) {
      expect(theme.source).toBe('bundled');
    }
  });

  it('orders themes with an explicit `order` before order-less ones', () => {
    const manifests = [
      { id: 'z-theme', label: 'Z' },
      { id: 'ordered', label: 'Ordered', order: 1 },
      { id: 'a-theme', label: 'A' },
    ];
    expect(selectableThemes(manifests).map((theme) => theme.id)).toEqual(['ordered', 'a-theme', 'z-theme']);
  });
});
