import { expect, it } from 'vitest';
import type { WorkflowNode } from '../types';
import { createStorybookContentSelector } from './useStorybookContentNodes';

const book = (id: string, json = '{}') => ({
  id, data: { nodeType: 'rp-storybook', storybookJson: json },
}) as WorkflowNode;

it('preserves content identity across activity, reasoning and position updates', () => {
  const select = createStorybookContentSelector();
  const source = book('book');
  const llm = { id: 'llm', data: { nodeType: 'llm-prompt' } } as WorkflowNode;
  const initial = select([source, llm]);
  for (let tokens = 1; tokens <= 100; tokens++) {
    expect(select([
      { ...source, position: { x: tokens, y: 0 }, data: { ...source.data, runActive: true } },
      { ...llm, data: { ...llm.data, llmActiveReasoningTokens: tokens } },
    ])).toBe(initial);
  }
});

it('invalidates for edits, replacement, reordering, removal and source type changes', () => {
  const select = createStorybookContentSelector();
  const first = book('one');
  const second = book('two');
  let previous = select([first, second]);
  const changed = book('one', '{"changed":true}');
  for (const nodes of [
    [changed, second], [second, changed], [book('replacement'), changed],
    [changed], [{ ...changed, data: { nodeType: 'note' } } as WorkflowNode],
  ]) {
    const next = select(nodes);
    expect(next).not.toBe(previous);
    previous = next;
  }
  expect(previous).toEqual([]);
  expect(select([first])).toEqual([first]);
});
