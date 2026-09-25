import { expect, it } from 'vitest';
import { fastTaskReasoningStart, fastTaskReasoningEnd } from './fastTaskPrompt';
import { buildHistoryRpTimePrompt, defaultHistoryRpTimePromptText } from '../nodes/history/rpTimePrompt';
import { buildEventManagerPrompt, defaultEventManagerPromptText } from '../nodes/event-manager/prompt';
import { translationPrompt, directInputPrompt } from '../chat/inputTransforms';

it.each([
  [buildHistoryRpTimePrompt, defaultHistoryRpTimePromptText],
  [buildEventManagerPrompt, defaultEventManagerPromptText],
] as const)('keeps reasoning in the visible default template and respects custom prompts', (build, template) => {
  expect(template.startsWith(fastTaskReasoningStart)).toBe(true);
  expect(template.endsWith(fastTaskReasoningEnd)).toBe(true);
  expect(build(undefined, {})).toBe(template);
  expect(build({ mode: 'custom', customText: 'Only my instructions.' }, {})).toBe('Only my instructions.');
  expect(build({ mode: 'custom', customText: '' }, {})).toBe('');
});

it('includes reasoning exactly once in translation and direct input prompts', () => {
  const prompts = [
    translationPrompt({ text: 'Hello', direction: 'to-display', displayLanguage: 'German' }),
    translationPrompt({ text: 'Hello', direction: 'to-english', displayLanguage: 'German' }),
    directInputPrompt({ text: 'Say hello', channel: 'rp', displayLanguage: 'German' }),
    directInputPrompt({ text: 'Say hello', channel: 'phone', displayLanguage: 'German' }),
  ];
  for (const prompt of prompts) {
    expect(prompt.startsWith(fastTaskReasoningStart)).toBe(true);
    expect(prompt.endsWith(fastTaskReasoningEnd)).toBe(true);
    expect(prompt.split(fastTaskReasoningStart)).toHaveLength(2);
    expect(prompt.split(fastTaskReasoningEnd)).toHaveLength(2);
  }
});
