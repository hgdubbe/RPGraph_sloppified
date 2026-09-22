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
