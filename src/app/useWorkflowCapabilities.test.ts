import { describe, it, expect } from 'vitest';
import type { WorkflowNode } from '../types';
import { createCapabilityRelevantNodesSelector } from './useWorkflowCapabilities';

const llmPromptNode = {
  id: 'llm-1',
  type: 'workflow',
  position: { x: 0, y: 0 },
  data: { nodeType: 'llm-prompt', label: 'LLM Prompt', connectionId: 'conn-1' },
} as WorkflowNode;

describe('createCapabilityRelevantNodesSelector', () => {
  it('preserves absent connection IDs and notices an explicit default connection', () => {
    const select = createCapabilityRelevantNodesSelector();
    const node = { ...llmPromptNode, data: { nodeType: 'output', label: 'Output' } } as WorkflowNode;
    const initial = select([node]);
    expect(Object.prototype.hasOwnProperty.call(initial[0].data, 'connectionId')).toBe(false);
    const explicit = select([{ ...node, data: { ...node.data, connectionId: undefined } }]);
    expect(explicit).not.toBe(initial);
    expect(Object.prototype.hasOwnProperty.call(explicit[0].data, 'connectionId')).toBe(true);
    expect(select([node])).not.toBe(explicit);
  });

  it('invalidates when output titles expose another prompt-switch channel', () => {
    const select = createCapabilityRelevantNodesSelector();
    const node = { ...llmPromptNode, data: {
      ...llmPromptNode.data, nodeType: 'llm-prompt-switch', llmPromptSwitchOutputTitles: ['First'],
    } } as WorkflowNode;
    const initial = select([node]);
    const expanded = select([{ ...node, data: {
      ...node.data, llmPromptSwitchOutputTitles: ['First', 'Second'],
    } }]);
    expect(expanded).not.toBe(initial);
    expect(expanded[0].data.llmPromptSwitchOutputTitles).toEqual(['First', 'Second']);
  });

  it('ignores unrelated node-data edits but reacts to fields the capability scan reads', () => {
    const select = createCapabilityRelevantNodesSelector();
    const initial = select([llmPromptNode]);
    const unrelatedEdit = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, generatedText: 'hello' } }]);
    expect(unrelatedEdit).toBe(initial);

    const promptEdited = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, llmPromptBefore: 'new text' } }]);
    expect(promptEdited).not.toBe(initial);
    expect(promptEdited[0].data.llmPromptBefore).toBe('new text');

    const stillEdited = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, llmPromptBefore: 'new text', generatedText: 'more' } }]);
    expect(stillEdited).toBe(promptEdited);

    const active = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, llmPromptBefore: 'new text', runActive: true } }]);
    expect(active).not.toBe(stillEdited);
    expect(active[0].data.runActive).toBe(true);
  });
});

it('updates the capability scan when actual reasoning starts and stops', () => {
  const select = createCapabilityRelevantNodesSelector();
  const initial = select([llmPromptNode]);
  const thinking = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, runReasoningActive: true } }]);
  expect(thinking).not.toBe(initial);
  expect(thinking[0].data.runReasoningActive).toBe(true);
  const done = select([{ ...llmPromptNode, data: { ...llmPromptNode.data, runReasoningActive: false } }]);
  expect(done).not.toBe(thinking);
  expect(done[0].data.runReasoningActive).toBe(false);
});
