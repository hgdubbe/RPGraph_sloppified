import { expect, it } from 'vitest';
import type { WorkflowNode } from '../types';
import { createNodeViewContentSelector } from './nodeViewContent';
import { settingsValueEntries } from '../workflow/nodeHelpers';

const source = (id: string, nodeType: string, data: object = {}) => ({
  id, type: 'workflow', position: { x: 1, y: 2 }, data: { nodeType, label: id, ...data },
}) as WorkflowNode;

it('keeps shared content stable across step transitions and completed outputs', () => {
  const select = createNodeViewContentSelector();
  const book = source('book', 'rp-storybook', { storybookJson: 'authored content' });
  const llm = source('llm', 'llm-prompt-switch');
  const output = source('output', 'output');
  const history = source('history', 'history');
  const initial = select([book, llm, output, history]);
  for (const active of ['llm', 'output', 'history']) {
    const next = [book, llm, output, history].map((node) => ({ ...node,
      position: { x: 50, y: 50 }, data: { ...node.data,
        runActive: node.id === active, llmActiveCallLabel: active,
        llmActiveReasoningTokens: 10, preview: 'completed text', fullText: 'completed text',
      },
    }));
    expect(select(next)).toBe(initial);
  }
  expect(initial.map((node) => node.id)).toEqual(['book']);
  expect(initial[0].data.storybookJson).toBe('authored content');
  expect(initial[0].data.runActive).toBeUndefined();
});

it('updates authored storybook and compression source values, topology and type changes', () => {
  const select = createNodeViewContentSelector();
  const book = source('book', 'rp-storybook', { storybookJson: 'before' });
  const number = source('limit', 'fixed-number', { fixedNumberValue: 1000 });
  const settings = source('settings', 'settings-value');
  const initial = select([book, number, settings]);
  expect(settingsValueEntries(initial[2].data)).toEqual(settingsValueEntries(settings.data));
  const entries = [{ id: 'custom', optionKey: 'custom-limit', label: 'Custom' }];
  const edited = select([
    { ...book, data: { ...book.data, storybookJson: 'after' } },
    { ...number, data: { ...number.data, fixedNumberValue: 2000 } },
    { ...settings, data: { ...settings.data, settingsValueEntries: entries } },
  ]);
  expect(edited).not.toBe(initial);
  expect(edited[0].data.storybookJson).toBe('after');
  expect(edited[1].data.fixedNumberValue).toBe(2000);
  expect(settingsValueEntries(edited[2].data)).toBe(entries);
  expect(select([settings, number, book]).map((node) => node.id)).toEqual(['settings', 'limit', 'book']);
  expect(select([{ ...number, data: { ...number.data, nodeType: 'note' } }])).toEqual([]);
  expect(select([book])).toHaveLength(1);
  expect(select([])).toEqual([]);
});
