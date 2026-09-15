import { describe, expect, it } from 'vitest';
import {
  isStudioTheme,
  studioThemeLabel,
  studioThemeStorageKey,
  studioThemes,
  type StudioTheme,
} from './studioTheme';

describe('studioTheme', () => {
  it('accepts only known theme ids', () => {
    expect(isStudioTheme('studio-night')).toBe(true);
    expect(isStudioTheme('cute-girly')).toBe(true);
    expect(isStudioTheme('paper-notes')).toBe(false);
    expect(isStudioTheme('')).toBe(false);
  });

  it('exposes ten selectable themes', () => {
    expect(studioThemes.map((theme) => theme.id)).toEqual([
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
    ]);
  });

  it('labels themes for the selector', () => {
    expect(studioThemeLabel('kawaii-dream')).toBe('Kawaii Dream');
    expect(studioThemeLabel('hardcore' satisfies StudioTheme)).toBe('Hardcore');
  });

  it('uses a stable localStorage key', () => {
    expect(studioThemeStorageKey).toBe('rpgraph.studioTheme');
  });
});
