import type { CSSProperties } from 'react';

const textEffectKinds = ['narration', 'dialogue', 'messages'] as const;
type TextEffectKind = typeof textEffectKinds[number];
type TextEffectSettings = { enabled: boolean; intensity: number; wavelength: number };
export type TextEffectsSettings = Record<TextEffectKind, TextEffectSettings>;

const percent = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : 100;

/** Missing settings preserve the appearance used before these controls existed. */
export function normalizeTextEffects(value?: unknown): TextEffectsSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(textEffectKinds.map((kind) => {
    const raw = source[kind];
    const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return [kind, {
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
      intensity: percent(entry.intensity, 0, 200),
      wavelength: percent(entry.wavelength, 50, 150),
    }];
  })) as TextEffectsSettings;
}

/** Shared variables keep main chat and all phone message renderers in sync. */
export function textEffectsStyle(settings: TextEffectsSettings): CSSProperties {
  const values: Record<string, string> = {};
  for (const kind of textEffectKinds) {
    const effect = settings[kind];
    const intensity = effect.intensity / 100;
    const scale = effect.wavelength / 100;
    const prefix = `--${kind}-effect`;
    values[`${prefix}-dark`] = `${100 - (kind === 'dialogue' ? 7 : 10) * intensity}%`;
    values[`${prefix}-mid`] = `${100 - 5 * intensity}%`;
    values[`${prefix}-light`] = `${100 - (kind === 'dialogue' ? 20 * intensity : 40 * Math.max(0, intensity - 1))}%`;
    values[`${prefix}-width`] = `${(kind === 'messages' ? 25.6 : 32) * scale}ch`;
    values[`${prefix}-fill`] = effect.enabled ? 'transparent' : 'currentColor';
    if (!effect.enabled) values[`${prefix}-image`] = 'none';
  }
  return values as CSSProperties;
}
