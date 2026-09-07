import { describe, expect, it } from 'vitest';
import type { WorkflowNode } from '../../types';
import type { ExecuteContext } from '../types';
import { executeLlmPromptSwitchNode } from './execute';
import { migrateRouter } from './routerModel';

function fixture() {
  const node = { id: 'router', position: { x: 0, y: 0 }, data: {
    nodeType: 'llm-prompt-switch', label: 'Router',
    llmPromptSwitchOutputTitles: ['Story', 'Phone'],
    llmPromptSwitchPromptTitlesByOutput: [['Story'], ['Reply']],
    llmPromptSwitchPromptBeforesByOutput: [['story'], ['phone before']],
    llmPromptSwitchPromptAftersByOutput: [[''], ['phone after']],
  } } as WorkflowNode;
  const patches: Partial<WorkflowNode['data']>[] = [];
  const prompts: string[] = [];
  const context = {
    nodes: [node], edges: ['text', 'output-channel', 'prompt-slot'].map((handle) => ({
      id: handle, source: handle, target: node.id, targetHandle: handle,
    })),
    historyMessages: [], runScratch: new Map(), settingsValues: {}, settingsValueDefinitions: [],
    comfyProviderIds: [], providerHealthById: {}, textMetrics: { bytesPerToken: 4 }, referenceImages: { maxImages: 0 },
    executeInput: async (id: string) => ({ text: 'input', 'output-channel': '1', 'prompt-slot': '0' }[id] ?? ''),
    updateRuntimeData: (_id: string, patch: Partial<WorkflowNode['data']>) => patches.push(patch),
    reportWarning: () => {}, reportFormatResult: () => {},
    llm: { supportsVision: async () => false, complete: async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt); return { text: 'reply', connection: { label: 'Test' } };
    } },
  } as unknown as ExecuteContext;
  return { node, context, patches, prompts };
}

describe('Response Router execution', () => {
  it('reports failed strict selection without leaving the previous run active', async () => {
    const { node, context, patches, prompts } = fixture();
    node.data.responseRouter = { ...migrateRouter(node.data), policy: 'strict' };
    context.executeInput = async (id) => id === 'output-channel' ? 'bad' : '0';
    await expect(executeLlmPromptSwitchNode(node, context)).rejects.toThrow('integer');
    expect(prompts).toHaveLength(0);
    expect(patches.some((patch) => patch.responseRouterLastRun?.state === 'error' && patch.responseRouterLastRun.outputValue === 'bad')).toBe(true);
  });

  it('stops disconnected strict outputs before calling a model when configured', async () => {
    const { node, context, patches, prompts } = fixture();
    node.data.responseRouter = { ...migrateRouter(node.data), policy: 'strict' };
    node.data.responseRouter.outputs[1].disconnected = 'error';
    await expect(executeLlmPromptSwitchNode(node, context)).rejects.toThrow('not connected');
    expect(prompts).toHaveLength(0);
    expect(patches.some((patch) => patch.responseRouterLastRun?.state === 'error')).toBe(true);
  });

  it('memoizes provider failure and records the attempted route', async () => {
    const { node, context, patches } = fixture();
    let calls = 0;
    context.llm.complete = async () => { calls++; throw new Error('Provider unavailable'); };
    await expect(executeLlmPromptSwitchNode(node, context)).rejects.toThrow('Provider unavailable');
    await expect(executeLlmPromptSwitchNode(node, context)).rejects.toThrow('Provider unavailable');
    expect(calls).toBe(1);
    expect(patches.some((patch) => patch.responseRouterLastRun?.state === 'error' && patch.responseRouterLastRun.routeId === 'route-1-0')).toBe(true);
  });
  it('executes once for concurrent output reads and never changes editor selection', async () => {
    const { node, context, patches, prompts } = fixture();
    const results = await Promise.all(['output-channel-0', 'output-channel-1'].map((sourceHandle) =>
      executeLlmPromptSwitchNode(node, { ...context, sourceHandle })));
    expect(results).toEqual(['', 'reply']);
    expect(prompts).toEqual(['phone before\n\ninput\n\nphone after']);
    expect(patches.every((patch) => patch.llmPromptSwitchSelectedOutputChannel === undefined)).toBe(true);
    expect(patches.some((patch) => patch.responseRouterLastRun?.state === 'success')).toBe(true);
  });

  it('uses a configuration snapshot even while inputs are pending', async () => {
    const { node, context, prompts } = fixture();
    node.data.responseRouter = migrateRouter(node.data);
    const promise = executeLlmPromptSwitchNode(node, { ...context, sourceHandle: 'output-channel-1' });
    node.data.responseRouter.outputs[1].routes[0].before = 'changed while running';
    await promise;
    expect(prompts[0]).toContain('phone before');
  });

  it('rejects ambiguous selector sources before executing upstream work in strict mode', async () => {
    const { node, context, prompts } = fixture();
    node.data.responseRouter = { ...migrateRouter(node.data), policy: 'strict' };
    context.edges.push({ id: 'duplicate', source: 'other', target: node.id, targetHandle: 'prompt-slot' });
    let inputs = 0;
    context.executeInput = async () => { inputs++; return '0'; };
    await expect(executeLlmPromptSwitchNode(node, context)).rejects.toThrow('multiple');
    expect(inputs).toBe(0);
    expect(prompts).toHaveLength(0);
  });

  it('skips blank input without calling a model', async () => {
    const { node, context, prompts, patches } = fixture();
    context.executeInput = async (id) => id === 'text' ? ' ' : '0';
    expect(await executeLlmPromptSwitchNode(node, { ...context, sourceHandle: 'output-channel-0' })).toBe('');
    expect(prompts).toHaveLength(0);
    expect(patches.some((patch) => patch.responseRouterLastRun?.state === 'skipped')).toBe(true);
  });
});
