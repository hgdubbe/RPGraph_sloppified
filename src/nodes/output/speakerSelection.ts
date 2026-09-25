import type { StorybookCharacter } from '../../storybook/runtime';
import { characterMessageAliases } from '../../characters/messageAliases';
import { normalizePhoneName } from '../../chat/phoneMessages';

function normalizedMention(value: string) {
  return normalizePhoneName(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function mentions(text: string, alias: string) {
  const needle = normalizedMention(alias).replace(/^@/, '').trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

export type HighlightingSpeakerContext = {
  selectedCharacterId?: string;
  participants?: Array<{ app: string; role: 'sender' | 'recipient'; identity: string }>;
};

export function highlightingSpeakerReferences(
  characters: StorybookCharacter[],
  interactedIds: string[],
  responseText: string,
  context: HighlightingSpeakerContext = {},
) {
  const interacted = new Set(interactedIds);
  const text = normalizedMention(responseText);
  const candidates = characters.map((character) => {
    const reasons: string[] = [];
    const playable = character.playerSelectable !== false;
    const selected = character.id === context.selectedCharacterId || character.sourceId === context.selectedCharacterId;
    const known = interacted.has(character.sourceId);
    if (selected) reasons.push('Selected player');
    if (playable) reasons.push('Playable');
    if (!character.libraryNpc) reasons.push('Storybook character');
    if (known) reasons.push('Interacted character');
    const hits: string[] = [];
    if (mentions(text, character.name)) hits.push(`Full name: ${character.name}`);
    else {
      const names = character.name.trim().split(/\s+/);
      if (names[0] && mentions(text, names[0])) hits.push(`First name: ${names[0]}`);
      const surname = names.slice(1).join(' ');
      if (surname && mentions(text, surname)) hits.push(`Last name: ${surname}`);
    }
    const aliases = [...characterMessageAliases(character),
      ...Object.values(character.apps ?? {}).flatMap((account) => account ? [account.accountId] : []),
      ...Object.values(character.identityAliases?.accountIds ?? {}).flat()];
    for (const alias of new Set(aliases)) {
      if (alias !== character.name && mentions(text, alias)) hits.push(`Account alias: ${alias}`);
    }
    const identities = [...aliases, character.id, character.sourceId, ...(character.identityAliases?.characterIds ?? [])];
    for (const participant of context.participants ?? []) {
      // Structured participants require complete identities, never first-name guesses.
      if (identities.some((alias) => normalizedMention(alias).replace(/^@/, '') ===
        normalizedMention(participant.identity).replace(/^@/, ''))) {
        hits.push(`${participant.app} message ${participant.role}: ${participant.identity}`);
      }
    }
    return { character, reasons: [...reasons, ...new Set(hits)],
      included: selected || playable || known || hits.length > 0,
      priority: playable || selected ? 0 : known ? 1 : 2 };
  });
  const seen = new Set<string>();
  return candidates.filter((entry) => entry.included).sort((a, b) => a.priority - b.priority)
    .filter(({ character }) => {
      if (seen.has(character.sourceId)) return false;
      seen.add(character.sourceId);
      return true;
    }).map(({ character, reasons }, index) => ({
      character, speakerId: index + 1, name: character.name, details: reasons.join('; '),
    }));
}

/** Keep stable group order and assign IDs only after selecting the current cast. */
export function selectHighlightingSpeakers(
  characters: StorybookCharacter[], interactedIds: string[], responseText: string,
) {
  return highlightingSpeakerReferences(characters, interactedIds, responseText).map((entry) => entry.character);
}
