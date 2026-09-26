import { expect, it } from 'vitest';
import type { MessageRecord } from '../types';
import { needsOpeningMessageSync } from './openingMessage';

const opening: MessageRecord = { id: 1, role: 'output', originalText: 'Opening text', isOpening: true, speakerName: 'Opening' };
it('does not request publication for unchanged openings or ongoing live output', () => {
  expect(needsOpeningMessageSync([], '')).toBe(false);
  expect(needsOpeningMessageSync([opening], opening.originalText)).toBe(false);
  for (const role of ['user', 'output'] as const) {
    const live: MessageRecord = { id: 2, role, originalText: '' };
    expect(needsOpeningMessageSync([opening, live], 'Changed opening')).toBe(false);
    expect(needsOpeningMessageSync([live], 'New opening')).toBe(false);
  }
});
it('still creates, updates and removes an opening before conversation and after undo', () => {
  expect(needsOpeningMessageSync([], 'New opening')).toBe(true);
  expect(needsOpeningMessageSync([opening], 'Changed opening')).toBe(true);
  expect(needsOpeningMessageSync([opening], '')).toBe(true);
  expect(needsOpeningMessageSync([{ id: 2, role: 'error', originalText: 'Error' }], 'New opening')).toBe(true);
  expect(needsOpeningMessageSync([{ id: 2, role: 'output', originalText: 'Phone', channel: 'phone' }], 'New opening')).toBe(true);
  expect(needsOpeningMessageSync([{ ...opening, turnId: 'historical' }], 'New opening')).toBe(true);
});
