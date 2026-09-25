import { expect, it } from 'vitest';
import type { StorybookCharacter } from '../../storybook/runtime';
import { selectHighlightingSpeakers, highlightingSpeakerReferences } from './speakerSelection';

function character(name: string, playable = false, apps = {}): StorybookCharacter {
  return { id: name, sourceId: name, name, playerSelectable: playable, apps } as StorybookCharacter;
}

it('orders players, interacted characters, and mentioned NPCs without duplicates', () => {
  const npc = character('Mira Chen');
  const known = character('Amber Lane');
  const player = character('Thomas Carter', true);
  const dormant = character('Nova Sky');
  expect(selectHighlightingSpeakers([npc, known, dormant, player], [known.sourceId], 'Mira and Thomas speak.'))
    .toEqual([player, known, npc]);
});

it.each(['Mira', 'Chen', 'MIRA CHEN', 'Mira_Chen', 'Mira-Chen'])(
  'recognizes name mention %s', (text) => {
    const npc = character('Mira Chen');
    expect(selectHighlightingSpeakers([npc], [], text)).toEqual([npc]);
  },
);

it.each(['whatsup', 'fotogram', 'onlyfriends', 'matchme'])(
  'recognizes %s account identifiers and display names', (app) => {
    const npc = character('Mira Chen', false, { [app]: {
      accountId: 'private-account-42', username: 'trace_hunter', profileName: 'Digital Detective',
    } });
    for (const text of ['@trace_hunter', 'Digital Detective', '@private-account-42']) {
      expect(selectHighlightingSpeakers([npc], [], text)).toEqual([npc]);
    }
  },
);

it('does not match name fragments inside other words', () => {
  expect(selectHighlightingSpeakers([character('Mira Chen')], [], 'A miracle happened.')).toEqual([]);
});

it('explains selection, character status, and ambiguous first-name hits', () => {
  const player = character('Thomas Carter', true);
  const known = { ...character('Mira Chen'), libraryNpc: true };
  const other = { ...character('Mira Stone'), libraryNpc: true };
  const refs = highlightingSpeakerReferences([other, known, player], [known.sourceId], 'Mira spoke.', {
    selectedCharacterId: player.id,
    participants: [{ app: 'WhatsUp', role: 'sender', identity: 'Mira Chen' }],
  });
  expect(refs.map((entry) => entry.name)).toEqual(['Thomas Carter', 'Mira Chen', 'Mira Stone']);
  expect(refs[0].details).toContain('Selected player; Playable; Storybook character');
  expect(refs[1].details).toContain('Interacted character');
  expect(refs[1].details).toContain('WhatsUp message sender: Mira Chen');
  expect(refs[2].details).toBe('First name: Mira');
});

it('includes structured message participants absent from narrative text', () => {
  const npc = character('Mira Chen', false, { fotogram: { accountId: 'trace-account', username: 'traces' } });
  const refs = highlightingSpeakerReferences([npc], [], 'The phone buzzed.', {
    participants: [{ app: 'fotogram', role: 'recipient', identity: '@traces' }],
  });
  expect(refs).toHaveLength(1);
  expect(refs[0].details).toContain('fotogram message recipient: @traces');
  expect(highlightingSpeakerReferences([npc], [], '', {
    participants: [{ app: 'WhatsUp', role: 'sender', identity: 'Mira' }],
  })).toEqual([]);
});
