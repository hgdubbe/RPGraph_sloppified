import { expect, it } from 'vitest';
import { finalReplyText } from './finalReply';

it.each(['think', 'thinking', 'analysis'])('removes leading %s without using its action examples', (tag) => {
  expect(finalReplyText(`<${tag}>{"blocks":["not the answer"]}</${tag}>\n{"blocks":[]}`)).toBe('{"blocks":[]}');
});
it('preserves tags inside actual reply content', () => {
  const text = '{"text":"literal <think>example</think>"}';
  expect(finalReplyText(text)).toBe(text);
});
it('handles repeated complete reasoning sections', () => {
  expect(finalReplyText('<think>one</think><analysis>two</analysis>Final')).toBe('Final');
});
it.each(['<think>{"blocks":[]}', '<think>done</think>'])('rejects reasoning without a final answer', (text) => {
  expect(() => finalReplyText(text)).toThrow(/final reply/);
});
