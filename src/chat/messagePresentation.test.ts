import { describe, expect, it } from 'vitest';
import type { MessageRecord } from '../types';
import { formatChatHistory, formatLastMessageForContext } from '../workflow/textHelpers';

describe('WhatsUp history presentation', () => {
  it('labels saved messages, images and replies in both languages without adding usernames', () => {
    const messages: MessageRecord[] = [
      { id: 1, role: 'user', channel: 'phone', phoneFrom: 'Alice', phoneTo: 'Bob',
        originalText: 'Photo @fotogram:Bob', translatedText: 'Translated photo @fotogram:Bob',
        phoneImageIds: ['photo-1'] },
      { id: 2, role: 'output', channel: 'phone', phoneFrom: 'Bob', phoneTo: 'Alice',
        originalText: 'Thanks', translatedText: 'Translated thanks', replyToMessageId: 1 },
    ];
    const before = JSON.stringify(messages);
    for (const translated of [false, true]) {
      const history = formatChatHistory(messages, translated);
      expect(history).toContain('[WhatsUp] Alice sends an image to Bob: [photo-1]');
      expect(history).toContain('[WhatsUp] Bob replies to Alice:');
      expect(history).toContain('@fotogram:Bob');
      expect(history).not.toContain('(@');
      expect(history).toContain(translated ? 'Translated thanks' : 'Thanks');
    }
    expect(formatLastMessageForContext(messages[0])).toContain('[WhatsUp] Alice sends an image to Bob:');
    expect(formatChatHistory([{ ...messages[0], phoneImageIds: [] }], false))
      .toContain('[WhatsUp] Alice texts Bob: Photo @fotogram:Bob');
    expect(JSON.stringify(messages)).toBe(before);
  });
});
