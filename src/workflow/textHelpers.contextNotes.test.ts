import { describe, expect, it } from 'vitest';
import type { MessageRecord } from '../types';
import { formatChatHistory } from './textHelpers';

describe('formatChatHistory context notes', () => {
  it('includes message context comments as annotations rather than extra messages', () => {
    const messages: MessageRecord[] = [{
      id: 1,
      role: 'user',
      originalText: 'oh thats awesome....',
      channel: 'phone',
      phoneMessage: true,
      phoneFrom: 'Yume',
      phoneTo: 'David',
      contextComment: 'clearly sarcastic statement',
    }];

    expect(formatChatHistory(messages, false)).toContain(
      'Context note: clearly sarcastic statement',
    );
  });
});
