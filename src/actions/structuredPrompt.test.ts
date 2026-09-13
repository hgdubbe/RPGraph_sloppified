import { describe, expect, it, vi } from 'vitest';
import { runActionAwarePrompt } from '../nodes/shared/promptRun';
import { executeOutputNode } from '../nodes/output/execute';
import { corePersistence } from '../nodes/corePersistence';
import type { ExecuteContext } from '../nodes/types';
import type { WorkflowNode } from '../types';
import { managedActionPromptText, managedActionPromptSections } from './promptPreset';

function fixture() {
  const complete = vi.fn<(request: { prompt: string }) => Promise<{ text: string; connection: { label: string } }>>(
    async () => ({ text: '{"version":1,"catalogId":"catalog","blocks":[]}', connection: { label: 'Test' } }),
  );
  const context = {
    structuredActionContext: '{"catalogId":"catalog","entries":[]}', legacyActionsDisabled: true,
    llm: { complete, supportsVision: async () => false }, reportWarning: vi.fn(),
  } as unknown as ExecuteContext;
  const node = { id: 'prompt', data: { nodeType: 'llm-prompt', label: 'Reply' } } as WorkflowNode;
  const run = (before: string) => runActionAwarePrompt({
    node, context, inputValue: 'Continue.', images: [], referenceImages: [],
    promptBefore: before, promptAfter: '', actionConfigs: [], commandConfigs: [],
    streamsVisibleOutput: true, contributesToTokenCalibration: true, callLabel: () => 'Test',
  });
  return { complete, context, node, run };
}

describe('structured prompt integration', () => {
  it('injects the current catalog and buffers the complete response', async () => {
    const f = fixture();
    const result = await f.run('Write the next reply.');
    expect(result.generatedText).toContain('"version":1');
    expect(f.complete).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('"catalogId":"catalog"'),
    }));
    expect(f.complete.mock.calls[0][0]).not.toHaveProperty('onChunk');
    expect(f.complete.mock.calls[0][0]).toHaveProperty('responseContract', 'actions-v1');
    for (const section of managedActionPromptSections) expect(f.complete.mock.calls[0][0].prompt).toContain(section.text);
  });

  it.each(['@action:send', 'inline @command:send'])('rejects legacy declarations before a provider call: %s', async (marker) => {
    const f = fixture();
    await expect(f.run(marker)).rejects.toThrow(/migrated prompts/);
    expect(f.complete).not.toHaveBeenCalled();
  });

  it('retains named planning steps and inserts each output once', async () => {
    const f = fixture();
    f.complete.mockResolvedValueOnce({ text: '<think>Private discarded draft</think>Unique planning result', connection: { label: 'Test' } });
    await f.run('@step:planning\nPlan.\n@step:reply\n@output:planning\nWrite.');
    expect(f.complete).toHaveBeenCalledTimes(2);
    expect(f.complete.mock.calls[0][0].prompt).not.toContain(managedActionPromptText);
    expect(f.complete.mock.calls[0][0]).not.toHaveProperty('responseContract');
    expect(f.complete.mock.calls[1][0]).toHaveProperty('responseContract', 'actions-v1');
    expect(f.complete.mock.calls[1][0].prompt).toContain(managedActionPromptText);
    expect(f.complete.mock.calls[1][0].prompt).not.toContain('Private discarded draft');
    const prompt = (f.complete.mock.calls[1][0] as { prompt: string }).prompt;
    expect(prompt.match(/Unique planning result/g)).toHaveLength(1);
    expect(prompt).not.toContain('@output:');
  });

  it('does not impose the reply envelope on upstream context or next-turn preparation', async () => {
    const f = fixture();
    f.context.structuredActionContext = undefined;
    await f.run('Summarize the conversation.');
    expect(f.complete).toHaveBeenCalledTimes(1);
    expect(f.complete.mock.calls[0][0].prompt).not.toContain(managedActionPromptText);
  });

  it('passes typed JSON through RP Output without executing legacy variable commands', async () => {
    const f = fixture();
    const raw = '{"version":1,"blocks":[{"type":"text","text":"@command:set"}]}';
    const setWorkflowVariables = vi.fn();
    Object.assign(f.context, {
      edges: [{ source: 'prompt', target: 'output' }], executeInput: async () => raw, setWorkflowVariables,
    });
    const output = { id: 'output', data: { nodeType: 'output', label: 'RP Output' } } as WorkflowNode;
    expect(await executeOutputNode(output, f.context)).toBe(raw);
    expect(setWorkflowVariables).not.toHaveBeenCalled();
  });

  it('persists the explicit opt-in and defaults older outputs to Legacy', () => {
    const data = { nodeType: 'output', label: 'RP Output', description: '', preview: '' } as WorkflowNode['data'];
    const hydration = { defaultConnectionId: 'test', connectionIds: new Set(['test']) };
    expect(corePersistence.output.hydrateData(data, hydration).actionProtocol).toBe('legacy');
    const saved = corePersistence.output.saveData({ ...data, actionProtocol: 'actions-v1' });
    expect(corePersistence.output.hydrateData(saved, hydration).actionProtocol).toBe('actions-v1');
    const staged = corePersistence.output.saveData({ ...data, actionProtocol: 'staged-v1' });
    expect(corePersistence.output.hydrateData(staged, hydration).actionProtocol).toBe('staged-v1');
  });
});
