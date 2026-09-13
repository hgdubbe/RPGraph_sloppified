import { describe, expect, it } from 'vitest';
import { resolveDecisionPrimaryCharacterId } from './useGraphRun';
import type { StorybookCharacter } from '../storybook/runtime';

function character(id: string): StorybookCharacter {
  return {
    id, storybookNodeId: 'story', kind: 'character', sourceId: id, name: id, label: id,
    profile: { name: id, description: '', personality: '', speechStyle: '', role: '' },
    phoneSettings: { wallpaperId: 'wallpaper-1' },
    banking: { startBalance: 1000, fixedExpenses: [] },
    social: { fotogramUsername: '', onlyfriendsUsername: '' },
  };
}

const david = character('david');
const yume = character('yume');

describe('resolveDecisionPrimaryCharacterId', () => {
  it('a human-typed phone message ("user" turn) with a resolvable recipient generates the recipient\'s reply, not the sender\'s', () => {
    expect(resolveDecisionPrimaryCharacterId('user', david, yume)).toBe('yume');
  });

  it('Auto Turn ("<Sender> texts <Recipient>") keeps the sender as actor even though a recipient is known', () => {
    expect(resolveDecisionPrimaryCharacterId('auto-turn', david, yume)).toBe('david');
  });

  it('a narrator turn keeps the sender/input character as actor', () => {
    expect(resolveDecisionPrimaryCharacterId('narrator', david, yume)).toBe('david');
  });

  it('a "user" turn with no resolvable recipient (non-phone chat) falls back to the sender', () => {
    expect(resolveDecisionPrimaryCharacterId('user', david, undefined)).toBe('david');
  });

  it('no input character and no recipient resolves to undefined', () => {
    expect(resolveDecisionPrimaryCharacterId('user', undefined, undefined)).toBeUndefined();
  });
});
