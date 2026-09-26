import { CharacterName } from './CharacterName';
import { CharacterAvatar } from './CharacterAvatar';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { narratorCharacterId, narratorSpeakerName } from '../app/runOrchestration';
import type { StorybookCharacter } from '../storybook/runtime';

type CharacterSwitchChipProps = {
  /** Full roster rendered in the popover's switch list. */
  storyCharacters: StorybookCharacter[];
  /** Player-selectable subset shown first, ahead of NPCs, in the popover. */
  playerCharacters: StorybookCharacter[];
  narratorSelected: boolean;
  selectedCharacterId?: string;
  viewedPhoneCharacterId?: string;
  characterColors: ReadonlyMap<string, string>;
  selectChatCharacter: (id: string) => void;
  settingsLoadComplete: boolean;
  hintSeen: boolean;
  onHintSeen: (seen: boolean) => void;
  /** Unseen chat message count; renders as the pinned notification badge. */
  notificationCount?: number;
};

/**
 * A chip pinned atop the chat pane showing the active speaker (plus a stack
 * of the other playable characters). Clicking it opens a Studio-dialog-
 * themed popover to switch who is speaking, replacing both the old always-
 * visible character tablist and the edge-swipe quick picker.
 */
export function CharacterSwitchChip({
  storyCharacters,
  playerCharacters,
  narratorSelected,
  selectedCharacterId,
  viewedPhoneCharacterId,
  characterColors,
  selectChatCharacter,
  settingsLoadComplete,
  hintSeen,
  onHintSeen,
  notificationCount = 0,
}: CharacterSwitchChipProps) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const activeCharacter = narratorSelected
    ? undefined
    : storyCharacters.find((character) => character.id === selectedCharacterId);
  const activeName = narratorSelected ? narratorSpeakerName : activeCharacter?.name ?? 'Choose a character';
  const activeColor = narratorSelected ? undefined : activeCharacter ? characterColors.get(activeCharacter.name) : undefined;
  const stackCharacters = [
    ...(narratorSelected ? [] : activeCharacter ? [activeCharacter] : []),
    ...playerCharacters.filter((character) => character.id !== activeCharacter?.id),
  ].slice(0, 3);

  const showHint = settingsLoadComplete && !hintSeen && playerCharacters.length > 0 && !open;

  useEffect(() => {
    if (open && settingsLoadComplete && !hintSeen && playerCharacters.length > 0) {
      onHintSeen(true);
    }
  }, [open, settingsLoadComplete, hintSeen, playerCharacters.length, onHintSeen]);

  function dismiss() {
    setOpen(false);
  }

  function toggleOpen() {
    if (!open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent) {
      if (!chipRef.current?.contains(event.target as Node)) dismiss();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        previousFocus.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const roster = [
    { id: narratorCharacterId, name: narratorSpeakerName, profileImage: undefined as StorybookCharacter['profileImage'] },
    ...storyCharacters,
  ];

  return (
    <div ref={chipRef} className="character-switch-chip">
      {showHint && (
        <span className="feature-discovery-hint character-switch-chip-hint" role="status">
          Switch who you're playing as from the chip above the chat.
        </span>
      )}
      <button
        type="button"
        className="character-switch-chip-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span className="character-switch-chip-avatars" aria-hidden="true">
          {stackCharacters.length > 0 ? stackCharacters.map((character) => (
            <CharacterAvatar
              key={character.id}
              className={`character-switch-chip-avatar${character.id === activeCharacter?.id ? ' active-speaker' : ''}`}
              name={character.name}
              fallback={character.name.slice(0, 1)}
              profileImageDataUrl={character.profileImage?.dataUrl}
              ringColor={character.id === activeCharacter?.id ? undefined : characterColors.get(character.name)}
            />
          )) : (
            <CharacterAvatar
              className="character-switch-chip-avatar active-speaker"
              name={narratorSpeakerName}
              fallback={narratorSpeakerName.slice(0, 1)}
            />
          )}
        </span>
        <span className="character-switch-chip-label">
          <CharacterName color={activeColor}>{activeName}</CharacterName>
        </span>
        {!!notificationCount && <span className="studio-rail-badge character-switch-chip-badge">{notificationCount}</span>}
      </button>
      {open && (
        <div
          className="character-switch-chip-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Switch character"
        >
          <ul className="character-switch-chip-list">
            <li>
              <button
                type="button"
                className={`character-switch-chip-row${narratorSelected ? ' active' : ''}`}
                aria-pressed={narratorSelected}
                onClick={() => {
                  selectChatCharacter(narratorCharacterId);
                  dismiss();
                }}
              >
                <CharacterAvatar className="character-switch-chip-row-avatar" name={narratorSpeakerName} fallback={narratorSpeakerName.slice(0, 1)} />
                <span className="character-switch-chip-row-identity">
                  <strong>{narratorSpeakerName}</strong>
                  <span>system voice</span>
                </span>
              </button>
            </li>
            {roster.slice(1).map((character) => {
              const isActive = selectedCharacterId === character.id && !narratorSelected;
              const charColor = characterColors.get(character.name);
              return (
                <li key={character.id}>
                  <button
                    type="button"
                    className={`character-switch-chip-row${isActive ? ' active' : ''}`}
                    aria-pressed={isActive}
                    style={charColor ? { '--character-tab-color': charColor } as CSSProperties : undefined}
                    onClick={() => {
                      selectChatCharacter(character.id);
                      dismiss();
                    }}
                  >
                    <CharacterAvatar
                      className="character-switch-chip-row-avatar"
                      name={character.name}
                      fallback={character.name.slice(0, 1)}
                      profileImageDataUrl={character.profileImage?.dataUrl}
                      ringColor={charColor}
                    />
                    <span className="character-switch-chip-row-identity">
                      <strong><CharacterName color={charColor}>{character.name}</CharacterName></strong>
                      <span>{isActive ? 'playing now' : character.id === viewedPhoneCharacterId ? 'phone open' : 'available'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
