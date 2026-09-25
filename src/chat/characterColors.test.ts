import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CharacterName } from '../components/CharacterName';
import { CharacterAvatar } from '../components/CharacterAvatar';
import { dialogueColors } from './textRendering';
import {
  characterColorPalette, characterColorToken, characterColorValue,
  isNpcCharacterColor, reserveCharacterColors, validCharacterColorSlots,
} from './characterColors';

describe('paired character colors', () => {
  it('preserves the original ten playable colors and adds a distinct second row', () => {
    expect(characterColorPalette.slice(0, 10).map((pair) => pair.playable)).toEqual(dialogueColors);
    expect(characterColorPalette).toHaveLength(20);
    expect(new Set(characterColorPalette.map((pair) => pair.playable)).size).toBe(20);
    expect(new Set(characterColorPalette.map((pair) => pair.npc)).size).toBe(20);
    for (const pair of characterColorPalette) {
      const channels = (hex: string) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
      const vivid = channels(pair.playable);
      const muted = channels(pair.npc);
      expect(Math.max(...muted) - Math.min(...muted)).toBeLessThan(Math.max(...vivid) - Math.min(...vivid));
      expect(Math.min(...muted)).toBeGreaterThanOrEqual(150);
      expect(Math.max(...muted) - Math.min(...muted)).toBeGreaterThanOrEqual(40);
      expect(pair.npc).not.toBe(pair.playable);
    }
  });

  it('reserves sequential slots across both roles, including the second palette and wraparound', () => {
    const players = reserveCharacterColors({}, ['p1', 'p2', 'p3']);
    const encounters = reserveCharacterColors(players, ['npc1', 'npc2']);
    expect(encounters).toEqual({ p1: 0, p2: 1, p3: 2, npc1: 3, npc2: 4 });
    expect(reserveCharacterColors(encounters, ['p3', 'npc2', 'p1', 'npc1', 'p2'])).toBe(encounters);
    expect(characterColorValue(encounters.npc2, false)).toBe(characterColorPalette[4].npc);
    expect(characterColorValue(encounters.npc2, true)).toBe(characterColorPalette[4].playable);
    expect(characterColorValue(10, true)).toBe(characterColorPalette[10].playable);
    expect(characterColorValue(20, true)).toBe(characterColorPalette[0].playable);
    expect(reserveCharacterColors(encounters, ['new']).new).toBe(5);
    expect(players).toEqual({ p1: 0, p2: 1, p3: 2 });
  });

  it('keeps canonical identity through role changes and supports arbitrary IDs', () => {
    for (const sourceId of ['nova', 'npc:a/b', '名前 👩🏽‍💻', '__proto__']) {
      for (const playerSelectable of [true, false]) {
        const token = characterColorToken({ sourceId, playerSelectable });
        expect(token).toMatch(/^var\(--rp-(?:npc|player)-[0-9a-f_]+\)$/);
        expect(characterColorToken({ sourceId, playerSelectable })).toBe(token);
        expect(isNpcCharacterColor(token)).toBe(!playerSelectable);
      }
    }
    expect(reserveCharacterColors({}, ['__proto__'])).toHaveProperty('__proto__', 0);
  });

  it('accepts legacy-free slot records and rejects collisions or malformed saved values', () => {
    expect(validCharacterColorSlots({})).toBe(true);
    expect(validCharacterColorSlots({ a: 0, b: 3 })).toBe(true);
    for (const value of [null, [], { a: -1 }, { a: 1.5 }, { a: Infinity }, { a: '0' }, { a: 0, b: 0 }]) {
      expect(validCharacterColorSlots(value)).toBe(false);
    }
  });

  it('renders NPC names and portraits without the playable gradients', () => {
    for (const playerSelectable of [true, false]) {
      const color = characterColorToken({ sourceId: 'nova', playerSelectable });
      const name = renderToStaticMarkup(createElement(CharacterName, { color, children: 'Nova' }));
      const avatar = renderToStaticMarkup(createElement(CharacterAvatar, {
        className: 'phone-avatar', name: 'Nova', fallback: 'N', style: { borderColor: color },
      }));
      expect(name.includes('player-name-gradient')).toBe(playerSelectable);
      expect(avatar.includes('character-avatar-gradient')).toBe(playerSelectable);
      expect(name).toContain(color);
      expect(avatar).toContain(color);
    }
  });
});
