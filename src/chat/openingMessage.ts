import type { MessageRecord } from '../types';

/** Avoid publishing live stream snapshots merely because App rendered again. */
export function needsOpeningMessageSync(messages: MessageRecord[], openingSituation: string) {
  if (messages.some((message) => !message.isOpening && message.role !== 'error' && message.channel !== 'phone')) {
    return false;
  }
  const opening = messages.find((message) => message.isOpening && message.speakerName === 'Opening' && !message.turnId);
  return openingSituation ? opening?.originalText !== openingSituation : !!opening;
}
