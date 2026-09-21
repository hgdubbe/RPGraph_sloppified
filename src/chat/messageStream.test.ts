import { expect, it, vi } from 'vitest';
import { createMessageStream } from './messageStream';
import type { MessageRecord } from '../types';

it('provides stable snapshots and notifies only current subscribers', () => {
  const stream = createMessageStream();
  expect(stream.getSnapshot()).toBe(stream.getSnapshot());
  const listener = vi.fn();
  const unsubscribe = stream.subscribe(listener);
  const messages: MessageRecord[] = [{ id: 1, role: 'output', originalText: 'A' }];
  stream.publish(messages);
  expect(stream.getSnapshot()).toBe(messages);
  stream.publish(messages);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  stream.publish([{ ...messages[0], originalText: 'AB' }]);
  expect(listener).toHaveBeenCalledTimes(1);
  // Remounting a chat must see text that arrived while it was closed.
  expect(stream.getSnapshot()[0].originalText).toBe('AB');
});
