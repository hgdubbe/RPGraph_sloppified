import { useMemo, useState, type CSSProperties } from 'react';
import type { StorybookCharacter } from '../storybook/runtime';
import {
  characterColorToken, characterColorValue, reserveCharacterColors,
  type CharacterColorSlots,
} from '../chat/characterColors';

export function useCharacterColors(characters: StorybookCharacter[], players: StorybookCharacter[], interactedIds: string[]) {
  const [savedSlots, setCharacterColorSlots] = useState<CharacterColorSlots>({});
  // Reserve initial players first; existing slots always win, including promoted NPCs.
  const characterColorSlots = reserveCharacterColors(savedSlots, [...players.map((character) => character.sourceId), ...interactedIds]);
  if (characterColorSlots !== savedSlots) setCharacterColorSlots(characterColorSlots);
  const eligibleCharacters = useMemo(() => {
    const ids = new Set([...players.map((character) => character.sourceId), ...interactedIds]);
    return characters.filter((character) => ids.has(character.sourceId));
  }, [characters, players, interactedIds]);
  const characterColors = useMemo(() => new Map(eligibleCharacters.map((character) => [character.name, characterColorToken(character)])), [eligibleCharacters]);
  const characterColorStyle = useMemo(() => Object.fromEntries(eligibleCharacters.map((character) => [
    characterColorToken(character).slice(4, -1),
    characterColorValue(characterColorSlots[character.sourceId], character.playerSelectable !== false),
  ])) as CSSProperties, [eligibleCharacters, characterColorSlots]);
  return { characterColors, characterColorSlots, setCharacterColorSlots, characterColorStyle };
}
