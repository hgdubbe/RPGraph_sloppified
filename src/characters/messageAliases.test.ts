import { describe, expect, it } from 'vitest';
import { appCharactersFromRegistry } from './appRuntime';
import { buildCharacterRegistry } from './registry';
import { resolveWhatsUpMessageParticipants, resolveWhatsUpRecipient } from './messageIdentity';
import { resolveSocialMessageIdentity, validateSocialMessengerAccounts } from '../chat/socialMessageValidation';
import { datingAccounts, resolveDatingAccount } from '../chat/datingAccounts';

const cast = () => appCharactersFromRegistry(buildCharacterRegistry(['Alice Smith', 'Bob Jones'].map((name, index) => ({
  tier: 'storybook', source: 'book', character: {
    id: `person-${index}`, name, description: '', personality: '', speechStyle: '', role: '', images: [],
    apps: {
      whatsup: { accountId: `wa-${index}`, enabled: true, bio: '' },
      fotogram: { accountId: `fg-${index}`, enabled: true, profileName: `Photo ${index}`, legacyHandles: [`old.photo.${index}`], bio: '' },
      onlyfriends: { accountId: `of-${index}`, enabled: true, profileName: `Private ${index}`, bio: '' },
      matchme: { accountId: `mm-${index}`, enabled: true, profileName: name, bio: 'Hello', profile: { name, age: 25, bio: 'Hello', photoIds: ['portrait'], interests: '', decisions: {}, historyVersion: 1 as const } },
    },
  },
}))));

describe('cross-app message aliases', () => {
  it.each(['Alice Smith', '@Alice Smith', 'Photo 0', '@Photo 0', 'Private 0', '@Private 0', '@old.photo.0', '  @ALICE   SMITH  '])(
    'resolves %s to the owner in every messenger', (identity) => {
      const characters = cast();
      expect(resolveWhatsUpMessageParticipants(characters, [], { from: identity, to: '@Photo 1' }))
        .toMatchObject({ from: { name: 'Alice Smith', accountId: 'wa-0' }, to: { name: 'Bob Jones', accountId: 'wa-1' } });
      for (const app of ['fotogram', 'onlyfriends', 'matchme'] as const) {
        expect(resolveSocialMessageIdentity({ characters, messages: [], app, identity }))
          .toMatchObject({ available: true, name: 'Alice Smith' });
      }
      expect(resolveDatingAccount(identity, datingAccounts(characters))?.id).toBe('mm-0');
    },
  );

  it('accepts cross-app sender and recipient aliases in generated social JSON', () => {
    const text = JSON.stringify({ fotogramApp: [{ from: '@Private 0', to: '@Bob Jones', message: 'Hello' }] });
    expect(validateSocialMessengerAccounts({ text, characters: cast(), messages: [] }))
      .toEqual({ issues: [], sanitizedText: text });
  });

  it('rejects ambiguous fallback aliases and preserves stable target IDs', () => {
    const characters = cast();
    characters[1].apps!.onlyfriends!.profileName = 'Photo 0';
    expect(() => resolveWhatsUpRecipient(characters, [], '@Photo 0')).toThrow('Ambiguous');
    expect(resolveSocialMessageIdentity({ characters, messages: [], app: 'matchme', identity: '@Photo 0' }).available).toBe(false);
    expect(resolveWhatsUpRecipient(characters, [], 'wa-0').name).toBe('Alice Smith');
  });

  it('does not enable a disabled destination or use foreign account IDs as nicknames', () => {
    const characters = cast();
    characters[0].apps!.whatsup!.enabled = false;
    characters[0].apps!.onlyfriends!.enabled = false;
    expect(() => resolveWhatsUpRecipient(characters, [], '@Photo 0')).toThrow('Unavailable');
    expect(resolveSocialMessageIdentity({ characters, messages: [], app: 'onlyfriends', identity: '@Photo 0' }).available).toBe(false);
    expect(() => resolveWhatsUpRecipient(characters, [], 'fg-0')).toThrow('Unknown');
  });
});
