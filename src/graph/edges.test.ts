import { describe, it, expect } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '../types';
import { createEdgeRelevantNodesSelector, nodesPreparedAfterOutput, withSourceNodeStatusConnectionColors } from './edges';
import { removeEdgesConnectedToIncompatibleNodes } from '../workflow/persistence';

const llmPromptNode = {
  id: 'llm-1',
  type: 'workflow',
  position: { x: 0, y: 0 },
  data: { nodeType: 'llm-prompt', label: 'LLM Prompt' },
} as WorkflowNode;

describe('nodesPreparedAfterOutput with prompt override handles', () => {
  it('does not prepare an llm-prompt whose only incoming edges are overrides', () => {
    const edges: Edge[] = [
      { id: 'e-before', source: 'b', target: 'llm-1', targetHandle: 'prompt-before' } as Edge,
      { id: 'e-after', source: 'a', target: 'llm-1', targetHandle: 'prompt-after' } as Edge,
    ];

    expect(nodesPreparedAfterOutput([llmPromptNode], edges)).toEqual([]);
  });

  it('prepares an llm-prompt that has a Text Input edge alongside overrides', () => {
    const edges: Edge[] = [
      { id: 'e-before', source: 'b', target: 'llm-1', targetHandle: 'prompt-before' } as Edge,
      { id: 'e-text', source: 't', target: 'llm-1', targetHandle: null } as Edge,
    ];

    expect(nodesPreparedAfterOutput([llmPromptNode], edges)).toEqual(['llm-1']);
  });
});

describe('createEdgeRelevantNodesSelector', () => {
  it('preserves edge filtering and coloring across node status and compatibility changes', () => {
    const select = createEdgeRelevantNodesSelector();
    const target = { ...llmPromptNode, id: 'target' };
    const edges = [{ id: 'edge', source: llmPromptNode.id, target: target.id }] as Edge[];
    const variants = [
      [llmPromptNode, target],
      [{ ...llmPromptNode, data: { ...llmPromptNode.data, runPrepared: true } }, target],
      [{ ...llmPromptNode, data: { ...llmPromptNode.data, runCompleted: true } }, target],
      [llmPromptNode, { ...target, data: { ...target.data, kind: 'incompatible-core-node' } } as WorkflowNode],
      [llmPromptNode, target],
    ];
    for (const nodes of variants) {
      const narrowed = select(nodes);
      expect(withSourceNodeStatusConnectionColors(
        removeEdgesConnectedToIncompatibleNodes(narrowed, edges), narrowed,
      )).toEqual(withSourceNodeStatusConnectionColors(
        removeEdgesConnectedToIncompatibleNodes(nodes, edges), nodes,
      ));
    }
    expect(select([])).toEqual([]);
  });

  it('ignores unrelated node-data edits but reacts to id, kind, or run-status changes', () => {
    const select = createEdgeRelevantNodesSelector();
    const initial = select([llmPromptNode]);
    const unrelatedEdit = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, llmPromptBefore: 'hello' } }]);
    expect(unrelatedEdit).toBe(initial);

    const prepared = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, runPrepared: true } }]);
    expect(prepared).not.toBe(initial);
    expect(prepared[0].data.runPrepared).toBe(true);

    const stillPrepared = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, runPrepared: true, llmPromptBefore: 'world' } }]);
    expect(stillPrepared).toBe(prepared);

    const completed = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, runPrepared: true, runCompleted: true } }]);
    expect(completed).not.toBe(stillPrepared);

    const replaced = select([{ ...llmPromptNode, id: 'llm-2' }]);
    expect(replaced).not.toBe(completed);
    expect(replaced[0].id).toBe('llm-2');
  });
});
