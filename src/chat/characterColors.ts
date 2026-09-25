import { dialogueColors } from './textRendering';
import type { StorybookCharacter } from '../storybook/runtime';

// Each slot has a vivid playable color and a hue-shifted, near-neutral NPC color.
// The original ten playable colors keep their exact values and ordering.
export const characterColorPalette = [
  ...dialogueColors.map((playable, index) => ({ playable, npc: [
    '#dbcd9f', '#9fc3db', '#db9fb6', '#9fdbb3', '#bd9fdb',
    '#dbac9f', '#dbdb9f', '#9fd7db', '#9fc7db', '#d79fdb',
  ][index] })),
  ...[
    ['#d3c35e', '#d9dcad'], ['#578cc4', '#adb9dc'], ['#c8728a', '#dcadb0'],
    ['#72b28c', '#addcc9'], ['#ad86cb', '#cfaddc'], ['#c78d75', '#dcc3ad'],
    ['#bac65d', '#ccdcad'], ['#469cab', '#adc9dc'], ['#8baac6', '#adbddc'],
    ['#c882c6', '#dcadcf'],
  ].map(([playable, npc]) => ({ playable, npc })),
];

export type CharacterColorSlots = Record<string, number>;

export function validCharacterColorSlots(value: unknown): value is CharacterColorSlots {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((slot) => Number.isSafeInteger(slot) && slot >= 0 && slot < Number.MAX_SAFE_INTEGER) &&
    new Set(Object.values(value)).size === Object.values(value).length;
}

export function reserveCharacterColors(slots: CharacterColorSlots, ids: string[]): CharacterColorSlots {
  let next = slots;
  let index = Object.values(slots).reduce((max, slot) => Math.max(max, slot), -1) + 1;
  for (const id of ids) {
    if (!id || Object.prototype.hasOwnProperty.call(next, id)) continue;
    if (next === slots) next = { ...slots };
    Object.defineProperty(next, id, { value: index++, enumerable: true, configurable: true, writable: true });
  }
  return next;
}

/** CSS-safe canonical identity; unlike a display name or node ID, it survives promotion. */
export function characterColorToken(character: Pick<StorybookCharacter, 'sourceId' | 'playerSelectable'>) {
  const id = Array.from(character.sourceId, (char) => char.codePointAt(0)!.toString(16)).join('_');
  return `var(--rp-${character.playerSelectable === false ? 'npc' : 'player'}-${id})`;
}

export function isNpcCharacterColor(color: string | undefined) {
  return color?.startsWith('var(--rp-npc-') ?? false;
}

export function characterColorValue(slot: number, playable: boolean) {
  return characterColorPalette[slot % characterColorPalette.length][playable ? 'playable' : 'npc'];
}
