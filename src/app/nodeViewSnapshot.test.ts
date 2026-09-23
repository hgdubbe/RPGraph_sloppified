import { expect, it } from 'vitest';
import type { WorkflowNode } from '../types';
import { createNodeViewSnapshot } from './nodeViewSnapshot';

it('ignores dragging but immediately exposes runtime, style and topology changes', () => {
  const select = createNodeViewSnapshot();
  const node = { id: 'llm', type: 'workflow', position: { x: 0, y: 0 },
    data: { nodeType: 'llm-prompt', label: 'LLM' } } as WorkflowNode;
  const initial = [node];
  expect(select(initial)).toBe(initial);
  expect(select([{ ...node, position: { x: 100, y: 100 }, selected: true }])).toBe(initial);
  const active = [{ ...node, data: { ...node.data, runActive: true } }];
  expect(select(active)).toBe(active);
  const resized = [{ ...active[0], style: { width: 500 } }];
  expect(select(resized)).toBe(resized);
  const replaced = [{ ...resized[0], id: 'replacement' }];
  expect(select(replaced)).toBe(replaced);
  expect(select([])).toEqual([]);
});
