import type { EmbeddedSocialMessageLink } from '../types';
import type { ParsedIncomingSocialDirectMessage } from './phoneMessages';
import { incomingMatchMeMessage, type MatchMeState } from './matchMe';

/** Build display-only links without appending messages or changing unread state. */
export function socialMessagePreviewLinks(messages: ParsedIncomingSocialDirectMessage[], state: MatchMeState): EmbeddedSocialMessageLink[] {
  return messages.flatMap((message, index) => {
    if (!message.to) return [];
    const previewMessage = message.app === 'matchme'
      ? incomingMatchMeMessage(message.from, message.to, message.text, state,
        `preview-${index}`, '1970-01-01T00:00:00.000Z')
      : undefined;
    if (message.app === 'matchme' && !previewMessage) return [];
    return [{
      socialMessageId: -(index + 1), app: message.app,
      from: previewMessage?.from ?? message.from,
      to: previewMessage?.to ?? message.to,
      message: message.text, sourceOrder: message.sourceOrder,
      ...(previewMessage ? { previewMessage } : {}),
    }];
  });
}
