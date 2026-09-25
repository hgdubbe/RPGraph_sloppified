import { describe, expect, it } from 'vitest';
import { normalizeTextEffects, textEffectsStyle } from './textEffects';

describe('text effect preferences', () => {
  it('keeps all effects enabled at their existing appearance for older settings', () => {
    const settings = normalizeTextEffects();
    for (const effect of Object.values(settings)) {
      expect(effect).toEqual({ enabled: true, intensity: 100, wavelength: 100 });
    }
    expect(textEffectsStyle(settings)).toMatchObject({
      '--narration-effect-dark': '90%',
      '--narration-effect-mid': '95%',
      '--narration-effect-light': '100%',
      '--narration-effect-width': '32ch',
      '--dialogue-effect-dark': '93%',
      '--dialogue-effect-light': '80%',
      '--messages-effect-dark': '90%',
      '--messages-effect-width': '25.6ch',
    });
  });

  it('normalizes partial or invalid preferences without losing valid groups', () => {
    expect(normalizeTextEffects({
      narration: { enabled: false, intensity: 999, wavelength: -5 },
      dialogue: { enabled: 'false', intensity: NaN, wavelength: Infinity },
      messages: null,
    })).toEqual({
      narration: { enabled: false, intensity: 200, wavelength: 50 },
      dialogue: { enabled: true, intensity: 100, wavelength: 100 },
      messages: { enabled: true, intensity: 100, wavelength: 100 },
    });
    expect(normalizeTextEffects(null)).toEqual(normalizeTextEffects());
  });

  it('disables one group without affecting the other groups or fixed name effects', () => {
    const settings = normalizeTextEffects({ narration: { enabled: false } });
    const style = textEffectsStyle(settings);
    expect(style).toMatchObject({
      '--narration-effect-image': 'none',
      '--narration-effect-fill': 'currentColor',
      '--messages-effect-fill': 'transparent',
      '--dialogue-effect-fill': 'transparent',
    });
    expect(style).not.toHaveProperty('--messages-effect-image');
    expect(Object.keys(style).some((key) => /name|avatar/.test(key))).toBe(false);
    settings.narration.enabled = true;
    expect(textEffectsStyle(settings)).not.toHaveProperty('--narration-effect-image');
  });

  it('scales contrast independently from wave spacing', () => {
    const settings = normalizeTextEffects({
      narration: { intensity: 50, wavelength: 150 },
      dialogue: { intensity: 0, wavelength: 50 },
      messages: { intensity: 200, wavelength: 50 },
    });
    expect(textEffectsStyle(settings)).toMatchObject({
      '--narration-effect-dark': '95%',
      '--narration-effect-mid': '97.5%',
      '--narration-effect-width': '48ch',
      '--dialogue-effect-dark': '100%',
      '--dialogue-effect-light': '100%',
      '--dialogue-effect-width': '16ch',
      '--messages-effect-dark': '80%',
      '--messages-effect-light': '60%',
      '--messages-effect-width': '12.8ch',
    });
  });

  it('brightens neutral peaks only above the established default intensity', () => {
    for (const intensity of [0, 50, 100]) {
      expect(textEffectsStyle(normalizeTextEffects({ narration: { intensity } })))
        .toHaveProperty('--narration-effect-light', '100%');
    }
    expect(textEffectsStyle(normalizeTextEffects({ narration: { intensity: 150 } })))
      .toMatchObject({ '--narration-effect-dark': '85%', '--narration-effect-light': '80%' });
  });

  it('retains disabled effects and chosen values through settings serialization', () => {
    const settings = normalizeTextEffects({ messages: { enabled: false, intensity: 137, wavelength: 83 } });
    expect(normalizeTextEffects(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });
});
