import { describe, expect, it } from 'vitest';
import {
  isStudioMode,
  oppositeStudioMode,
  studioModeLabel,
  studioModeStorageKey,
} from './studioMode';

describe('studioMode', () => {
  it('accepts only supported studio modes', () => {
    expect(isStudioMode('play')).toBe(true);
    expect(isStudioMode('graph')).toBe(true);
    expect(isStudioMode('phone')).toBe(false);
    expect(isStudioMode(null)).toBe(false);
  });

  it('provides stable labels for shell controls', () => {
    expect(studioModeLabel('play')).toBe('Play Mode');
    expect(studioModeLabel('graph')).toBe('Graph Mode');
  });

  it('toggles between Play Mode and Graph Mode', () => {
    expect(oppositeStudioMode('play')).toBe('graph');
    expect(oppositeStudioMode('graph')).toBe('play');
  });

  it('uses the persisted key reserved for RPGraph studio mode', () => {
    expect(studioModeStorageKey).toBe('rpgraph.studioMode');
  });
});
