export type StudioMode = 'play' | 'graph';

export const studioModeStorageKey = 'rpgraph.studioMode' as const;

export function isStudioMode(value: unknown): value is StudioMode {
  return value === 'play' || value === 'graph';
}

export function studioModeLabel(mode: StudioMode): 'Play Mode' | 'Graph Mode' {
  return mode === 'play' ? 'Play Mode' : 'Graph Mode';
}

export function oppositeStudioMode(mode: StudioMode): StudioMode {
  return mode === 'play' ? 'graph' : 'play';
}
