import type { StorybookCharacter } from '../storybook/runtime';

export const messageAliasKey = (value: string) =>
  value.trim().replace(/^@/, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Presentation aliases identify an owner; delivery still requires a target-app account. */
export function characterMessageAliases(character: StorybookCharacter): string[] {
  const accounts = Object.values(character.apps ?? {});
  return [character.name, ...accounts.flatMap((account) => account ? [
    account.profileName ?? '', account.displayName ?? '', account.username ?? '', ...(account.legacyHandles ?? []),
  ] : []), ...(!character.apps ? [character.social.fotogramUsername, character.social.onlyfriendsUsername,
    character.social.plotTwist?.name ?? ''] : [])].filter((alias): alias is string => !!alias?.trim());
}

export function characterMessageAliasMatches(character: StorybookCharacter, identity: string) {
  const key = messageAliasKey(identity);
  return !!key && characterMessageAliases(character).some((alias) => messageAliasKey(alias) === key);
}
