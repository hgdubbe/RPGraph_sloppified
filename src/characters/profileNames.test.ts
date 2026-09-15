import { describe, expect, it } from 'vitest';
import { accountHandle, accountHandleMatches, characterPayload, normalizeCharacterApps, type Character } from './character';
import { createCharacterContainer } from './creator';
import { validateCharacterContainer } from './character';
import { withCharacterAppProfile } from './profiles';
import { appCharactersFromRegistry } from './appRuntime';
import { buildCharacterRegistry } from './registry';
import { resolveAccountLink } from '../chat/accountLinks';
import { buildSocialDirectory, searchSocialDirectory } from '../chat/socialDirectory';

const character = (displayName = 'Helga Harper'): Character => ({
  id: 'helga', name: 'Helga Harper', description: '', personality: '', speechStyle: '', role: '',
  playable: true, images: [],
  apps: { fotogram: { accountId: 'helga-fg', enabled: true, username: 'helga.afterhours', displayName, bio: '' },
    whatsup: { accountId: 'helga-wa', enabled: true, username: 'Helga Harper', displayName: 'Helga Harper', bio: '' } },
});

describe('one app profile name', () => {
  it('restores artist names, preserves customized names and exports one canonical field', () => {
    for (const [displayName, expected] of [['Helga Harper', 'helga.afterhours'], ['Helga Photogram', 'Helga Photogram']]) {
      const old = character(displayName);
      const before = JSON.stringify(old);
      const container = createCharacterContainer(old);
      expect(container.character.apps.fotogram?.profileName).toBe(expected);
      expect(container.character.apps.fotogram).not.toHaveProperty('username');
      expect(container.character.apps.fotogram).not.toHaveProperty('displayName');
      expect(container.character.apps.whatsup).not.toHaveProperty('profileName');
      expect(container.character.apps.whatsup).not.toHaveProperty('username');
      expect(container.character.apps.whatsup).not.toHaveProperty('displayName');
      expect(() => validateCharacterContainer(container)).not.toThrow();
      expect(JSON.stringify(old)).toBe(before);
      expect(createCharacterContainer(container.character)).toEqual(container);
    }
  });

  it('keeps routing and historical links stable after renaming and finds the current name', () => {
    const old = character();
    const apps = normalizeCharacterApps(old.apps, undefined, old.id, old.name);
    const renamed = withCharacterAppProfile({ ...old, apps }, 'fotogram', {
      ...apps.fotogram!, profileName: 'Helga New Artist',
    });
    const account = renamed.apps!.fotogram!;
    expect(accountHandle(account)).toBe('helga.afterhours');
    expect(accountHandleMatches(account, '@helga.afterhours')).toBe(true);
    expect(accountHandleMatches(account, '@Helga New Artist')).toBe(true);
    const cast = appCharactersFromRegistry(buildCharacterRegistry([{ character: renamed, tier: 'user', source: 'test' }]));
    expect(resolveAccountLink('fotogram', 'helga.afterhours', cast)?.accountId).toBe('helga-fg');
    expect(resolveAccountLink('fotogram', 'Helga New Artist', cast)?.accountId).toBe('helga-fg');
    expect(searchSocialDirectory(buildSocialDirectory({ storyCharacters: cast, messages: [] }).users,
      'fotogram', 'New Artist')).toHaveLength(1);
    expect(characterPayload(renamed).apps.fotogram?.profileName).toBe('Helga New Artist');
  });

  it('stores MatchMe names once and restores the editor projection on import', () => {
    const old = character();
    old.apps!.matchme = { accountId: 'helga-mm', enabled: false, username: 'helga.dates',
      displayName: old.name, bio: 'Hello', profile: { name: old.name, username: 'helga.dates',
        age: 25, bio: 'Hello', interests: 'Art', photoIds: [], decisions: {} } };
    const container = createCharacterContainer(old);
    expect(container.character.apps.matchme?.profileName).toBe('helga.dates');
    expect(container.character.apps.matchme?.profile).not.toHaveProperty('name');
    expect(container.character.apps.matchme?.profile).not.toHaveProperty('username');
    const apps = normalizeCharacterApps(container.character.apps, undefined, old.id, old.name);
    expect(apps.matchme?.profile?.name).toBe('helga.dates');
    expect(apps.matchme?.profile?.username).toBeUndefined();
    expect(() => validateCharacterContainer(container)).not.toThrow();
  });
});
