import { gradientPhaseStyle } from '../chat/gradientPhase';
import { isNpcCharacterColor } from '../chat/characterColors';
import { EmojiText } from './EmojiText';
import type { ReactNode } from 'react';

/** Canonical color tokens distinguish vivid players from flat, muted NPCs. */
export function CharacterName({ color, children }: { color?: string; children: ReactNode }) {
  if (!color) return <>{children}</>;
  return (
    <span
      className={isNpcCharacterColor(color) ? undefined : 'player-name-gradient'}
      style={{ ...gradientPhaseStyle(children), color, font: 'inherit', letterSpacing: 'inherit', display: 'inline' }}
    >
      {typeof children === 'string' ? <EmojiText text={children} /> : children}
    </span>
  );
}
