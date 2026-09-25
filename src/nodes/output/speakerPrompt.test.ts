import { expect, it } from 'vitest';
import { fastTaskReasoningStart, fastTaskReasoningEnd } from '../../llm/fastTaskPrompt';
import { buildOutputSpeakerPromptPreview } from './speakerPrompt';

it('records the actual custom prompt without unused input data', () => {
  const preview = buildOutputSpeakerPromptPreview(
    { mode: 'custom', customText: 'empty prompt' },
    { KnownSpeakers: 'Hidden NPC list', HighlightingContext: 'Unused history' },
  );
  expect(preview.prompt).toBe('empty prompt');
  expect(preview.parts.filter((part) => !part.actionInserted)).toEqual([{ text: 'empty prompt' }]);
  expect(preview.parts.map((part) => part.text).join('')).toBe(preview.prompt);
});

it('marks substitutions in place without expanding placeholders inside input data', () => {
  const preview = buildOutputSpeakerPromptPreview(
    { mode: 'custom', customText: 'Before\n<HighlightingContext>\nBetween\n<ResponseText>\nAfter' },
    { HighlightingContext: 'History with <ResponseText>', ResponseText: 'Actual response' },
  );
  expect(preview.prompt).toBe('Before\nHistory with <ResponseText>\nBetween\nActual response\nAfter');
  expect(preview.parts).toEqual([
    { text: 'Before\n' },
    { text: 'History with <ResponseText>', actionInserted: true },
    { text: '\nBetween\n' },
    { text: 'Actual response', actionInserted: true },
    { text: '\nAfter' },
  ]);
});

it('does not inject reasoning into an empty custom template', () => {
  const preview = buildOutputSpeakerPromptPreview({ mode: 'custom', customText: '  ' }, {});
  expect(preview.prompt).toBe('');
});

it('keeps reasoning instructions as editable default template text', () => {
  const preview = buildOutputSpeakerPromptPreview(undefined, {});
  expect(preview.prompt.startsWith(fastTaskReasoningStart)).toBe(true);
  expect(preview.prompt.endsWith(fastTaskReasoningEnd)).toBe(true);
  expect(preview.parts.every((part) => !part.actionInserted)).toBe(true);
});
