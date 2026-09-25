import { beforeEach, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';
import type { StorybookCharacter } from '../storybook/runtime';
import type { CharacterColorSlots } from '../chat/characterColors';
import { characterColorPalette } from '../chat/characterColors';
import { useCharacterColors } from './useCharacterColors';

const hooks = vi.hoisted(() => ({ slots: {} as CharacterColorSlots }));
vi.mock('react', () => ({
  useState: () => [hooks.slots, (update: SetStateAction<CharacterColorSlots>) => {
    hooks.slots = typeof update === 'function' ? update(hooks.slots) : update;
  }],
  useMemo: <T,>(compute: () => T) => compute(),
  useCallback: <T,>(callback: T) => callback,
}));
beforeEach(() => { hooks.slots = {}; });
const character = (id: string, playable: boolean) => ({ id, sourceId: id, name: id, playerSelectable: playable }) as StorybookCharacter;

it('reserves only encountered NPCs and retains their slot when promoted, renamed or demoted', () => {
  const players = ['a', 'b', 'c'].map((id) => character(id, true));
  const npc = character('npc', false);
  const dormant = character('dormant', false);
  let cast = [...players, dormant, npc];
  const interacted: string[] = [];
  // Exercise the hook state transitions without mounting the application.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const render = () => useCharacterColors(cast, cast.filter((entry) => entry.playerSelectable), interacted);
  const initial = render();
  expect(initial.characterColorSlots).toEqual({ a: 0, b: 1, c: 2 });
  expect(initial.characterColors.has('npc')).toBe(false);
  expect(initial.characterColors.has('dormant')).toBe(false);
  interacted.push('npc');
  const encountered = render();
  expect(encountered.characterColorSlots.npc).toBe(3);
  const npcToken = encountered.characterColors.get('npc')!;
  expect(encountered.characterColorStyle).toHaveProperty(npcToken.slice(4, -1), characterColorPalette[3].npc);
  cast = [{ ...npc, name: 'Renamed', playerSelectable: true }, ...players, dormant];
  const promoted = render();
  expect(promoted.characterColorSlots).toEqual({ a: 0, b: 1, c: 2, npc: 3 });
  expect(promoted.characterColorStyle).toHaveProperty(promoted.characterColors.get('Renamed')!.slice(4, -1), characterColorPalette[3].playable);
  cast = [...players, dormant, npc];
  expect(render().characterColorSlots.npc).toBe(3);
  interacted.push('dormant');
  expect(render().characterColorSlots.dormant).toBe(4);
});

it('uses saved slots and allocates after retired characters without reusing their positions', () => {
  const player = character('player', true);
  hooks.slots = { retired: 0, player: 4 };
  const runtime = useCharacterColors([player], [player], ['saved-npc']);
  expect(runtime.characterColorSlots).toEqual({ retired: 0, player: 4, 'saved-npc': 5 });
  runtime.setCharacterColorSlots({});
  expect(useCharacterColors([player], [player], []).characterColorSlots).toEqual({ player: 0 });
});

it('does not color inactive catalog entries even if an earlier version reserved their slots', () => {
  const player = character('player', true);
  const npc = character('npc', false);
  hooks.slots = { player: 0, npc: 7 };
  const inactive = useCharacterColors([player, npc], [player], []);
  expect(inactive.characterColors.has('npc')).toBe(false);
  const active = useCharacterColors([player, npc], [player], ['npc']);
  expect(active.characterColorSlots.npc).toBe(7);
  expect(active.characterColors.has('npc')).toBe(true);
});
