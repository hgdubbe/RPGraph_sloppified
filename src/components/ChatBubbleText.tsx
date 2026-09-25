import { gradientPhaseStyle } from '../chat/gradientPhase';
import { EmojiText } from './EmojiText';
import type { ReactNode } from 'react';

/** Keep the narration contrast while fitting shorter waves into chat bubbles. */
export function ChatBubbleText({ children }: { children: ReactNode }) {
  return (
    <span style={gradientPhaseStyle(children)} className="dialogue-text-gradient narration-text-gradient chat-bubble-text-gradient">
      {typeof children === 'string' ? <EmojiText text={children} /> : children}
    </span>
  );
}
