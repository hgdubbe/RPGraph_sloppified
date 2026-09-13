import { describe, expect, it, vi } from 'vitest';
import { compileTurnPlan, type CompileOptions } from './compileTurnPlan';
import { stagedRecipeDefinitions } from './recipeInventory';
import { createContinuationCheckpoint, runCompiledTurn, type StagedSchedulerAdapters } from './scheduler';
import { VariableStore } from './variableStore';
import type { TurnScope, VariableRef } from './contracts';

const scope: TurnScope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const privateToAlice = { kind: 'characters' as const, characterIds: ['alice'] };

function contextFixture() {
  const store = new VariableStore(scope);
  const facts = (id: string) => store.write({
    id,
    value: { kind: 'facts', facts: [{ sourceId: id, text: `${id} facts` }] },
    inputs: [],
    producer: { kind: 'context', sourceId: id },
    provenance: 'authoritative',
    visibility: privateToAlice,
    retention: 'turn',
  });
  const instruction = store.write({
    id: 'I',
    value: { kind: 'text', text: 'Write one short message.' },
    inputs: [],
    producer: { kind: 'context', sourceId: 'I' },
    provenance: 'observed',
    visibility: privateToAlice,
    retention: 'turn',
  });
  const context = {
    scope,
    catalogRevision: 'catalog-1',
    GH: facts('GH'),
    LM: facts('LM'),
    OC: facts('OC'),
    instructions: { write: instruction },
  };
  const options: CompileOptions = {
    context,
    store,
    catalog: { scope, revision: 'catalog-1', characterIds: ['alice', 'bob'] },
    recipes: stagedRecipeDefinitions(),
    initiator: 'model',
    limits: { beats: 8, calls: 8, generations: 2, continuations: 1 },
    allocateId: (() => {
      let id = 0;
      return () => `runtime-${++id}`;
    })(),
  };
  const planInput = {
    version: 'staged-v1',
    catalogRevision: 'catalog-1',
    continuations: 0,
    instances: [{
      id: 'message',
      recipe: 'whatsup.message',
      purpose: 'Send Bob a check-in.',
      actorId: 'alice',
      visibility: privateToAlice,
      args: { recipientId: 'bob' },
      inputs: {
        context: { source: 'variable', ref: context.GH },
        instructions: { source: 'variable', ref: instruction },
      },
      dependencies: [],
    }],
    beats: [{
      id: 'delivery',
      visibility: privateToAlice,
      content: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
      requiresReceipts: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
    }],
  };
  const compiled = compileTurnPlan(planInput, options);
  if (!compiled.ok) throw new Error(compiled.issues.map((issue) => issue.message).join('; '));
  return { store, plan: compiled.plan, instruction, context };
}

function adapters(): StagedSchedulerAdapters & {
  generateContent: ReturnType<typeof vi.fn<StagedSchedulerAdapters['generateContent']>>;
  executeAction: ReturnType<typeof vi.fn<StagedSchedulerAdapters['executeAction']>>;
} {
  return {
    generateContent: vi.fn<StagedSchedulerAdapters['generateContent']>(async () => 'hey Bob'),
    executeAction: vi.fn(async ({ stage }) => ({
      kind: 'receipt',
      operationId: stage.id,
      receiptId: 'sent-1',
    })),
  };
}

function assistantChatFixture() {
  const store = new VariableStore(scope);
  const facts = (id: string) => store.write({
    id,
    value: { kind: 'facts', facts: [{ sourceId: id, text: `${id} facts` }] },
    inputs: [],
    producer: { kind: 'context', sourceId: id },
    provenance: 'authoritative',
    visibility: privateToAlice,
    retention: 'turn',
  });
  const instruction = store.write({
    id: 'I',
    value: { kind: 'text', text: 'Write a short chat.' },
    inputs: [],
    producer: { kind: 'context', sourceId: 'I' },
    provenance: 'observed',
    visibility: privateToAlice,
    retention: 'turn',
  });
  const context = {
    scope,
    catalogRevision: 'catalog-1',
    GH: facts('GH'),
    LM: facts('LM'),
    OC: facts('OC'),
    instructions: { write: instruction },
  };
  const options: CompileOptions = {
    context,
    store,
    catalog: { scope, revision: 'catalog-1', characterIds: ['alice', 'bob'] },
    recipes: stagedRecipeDefinitions(),
    initiator: 'model',
    limits: { beats: 8, calls: 8, generations: 2, continuations: 1 },
    allocateId: (() => {
      let id = 0;
      return () => `runtime-${++id}`;
    })(),
  };
  const planInput = {
    version: 'staged-v1',
    catalogRevision: 'catalog-1',
    continuations: 0,
    instances: [{
      id: 'chat',
      recipe: 'assistant.chat',
      purpose: 'Simulate an assistant conversation.',
      actorId: 'alice',
      visibility: privateToAlice,
      args: { ownerId: 'alice' },
      inputs: {
        context: { source: 'variable', ref: context.GH },
        instructions: { source: 'variable', ref: instruction },
      },
      dependencies: [],
    }],
    beats: [{
      id: 'delivery',
      visibility: privateToAlice,
      content: [{ source: 'output', instanceId: 'chat', output: 'receipt', kind: 'receipt' }],
      requiresReceipts: [{ source: 'output', instanceId: 'chat', output: 'receipt', kind: 'receipt' }],
    }],
  };
  const compiled = compileTurnPlan(planInput, options);
  if (!compiled.ok) throw new Error(compiled.issues.map((issue) => issue.message).join('; '));
  return { store, plan: compiled.plan };
}

describe('staged scheduler assistant.chat messages output', () => {
  it('parses and validates a JSON messages reply before handing it to the action stage', async () => {
    const f = assistantChatFixture();
    const generateContent = vi.fn<StagedSchedulerAdapters['generateContent']>(async () =>
      JSON.stringify([{ role: 'user', text: 'Hi there' }, { role: 'assistant', text: 'Hello!' }]));
    const executeAction = vi.fn<StagedSchedulerAdapters['executeAction']>(async () =>
      ({ kind: 'receipt', operationId: 'op-1', receiptId: 'chat:1' }));
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: { generateContent, executeAction } });
    expect(result.ok).toBe(true);
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(executeAction.mock.calls[0][0].inputs[0].value).toEqual({
      kind: 'messages',
      messages: [{ role: 'user', text: 'Hi there' }, { role: 'assistant', text: 'Hello!' }],
    });
  });

  it('fails the stage when the model reply is not valid JSON', async () => {
    const f = assistantChatFixture();
    const generateContent = vi.fn<StagedSchedulerAdapters['generateContent']>(async () => 'not json');
    const executeAction = vi.fn<StagedSchedulerAdapters['executeAction']>(async () => ({ kind: 'receipt', operationId: 'op-1', receiptId: 'chat:1' }));
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: { generateContent, executeAction } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toContain('not valid JSON');
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('fails the stage when the JSON reply violates the alternation rules', async () => {
    const f = assistantChatFixture();
    const generateContent = vi.fn<StagedSchedulerAdapters['generateContent']>(async () =>
      JSON.stringify([{ role: 'assistant', text: 'Hello!' }, { role: 'user', text: 'Hi there' }]));
    const executeAction = vi.fn<StagedSchedulerAdapters['executeAction']>(async () => ({ kind: 'receipt', operationId: 'op-1', receiptId: 'chat:1' }));
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: { generateContent, executeAction } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toContain('Expected "user" at this position');
    expect(executeAction).not.toHaveBeenCalled();
  });
});

describe('staged scheduler', () => {
  it('runs stages sequentially and materializes exact output revisions', async () => {
    const f = contextFixture();
    const fake = adapters();
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake });
    expect(result.ok).toBe(true);
    expect(fake.generateContent).toHaveBeenCalledTimes(1);
    expect(fake.executeAction).toHaveBeenCalledTimes(1);
    expect(fake.executeAction.mock.calls[0][0].inputs[0].value).toEqual({ kind: 'text', text: 'hey Bob' });
    expect(result.stages.map((stage) => stage.status)).toEqual(['succeeded', 'succeeded']);
    expect(result.stages.map((stage) => stage.attempts)).toEqual([1, 1]);
    expect(result.diagnostics).toMatchObject({ contentCalls: 1, actionCalls: 1, variableWrites: 2 });
    expect(result.diagnostics.durationMs).toBeGreaterThanOrEqual(0);

    const receipt = Object.values(result.outputs).find((ref) => ref.kind === 'receipt');
    expect(receipt).toBeDefined();
    expect(f.store.read(receipt as VariableRef, scope, { characterId: 'alice' }).value).toEqual({
      kind: 'receipt',
      operationId: f.plan.stages[1].id,
      receiptId: 'sent-1',
    });
  });

  it('stops before later stages when content generation fails', async () => {
    const f = contextFixture();
    const fake = adapters();
    fake.generateContent.mockRejectedValueOnce(new Error('model offline'));
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toBe('model offline');
    expect(result.diagnostics).toMatchObject({ contentCalls: 1, actionCalls: 0, variableWrites: 0 });
    expect(fake.executeAction).not.toHaveBeenCalled();
    expect(result.stages.map((stage) => stage.status)).toEqual(['failed', 'blocked']);
  });

  it('retries content stages without retrying effectful stages', async () => {
    const f = contextFixture();
    f.plan.stages[0].retryPolicy = 'regenerate-draft-only';
    const fake = adapters();
    fake.generateContent
      .mockRejectedValueOnce(new Error('temporary format miss'))
      .mockResolvedValueOnce('retry worked');
    const result = await runCompiledTurn({
      plan: f.plan,
      store: f.store,
      adapters: fake,
      retry: { contentAttempts: 2 },
    });
    expect(result.ok).toBe(true);
    expect(fake.generateContent).toHaveBeenCalledTimes(2);
    expect(fake.executeAction).toHaveBeenCalledTimes(1);
    expect(result.stages[0].attempts).toBe(2);
    expect(result.diagnostics).toMatchObject({ contentCalls: 2, actionCalls: 1, variableWrites: 2 });
  });

  it('honors recipe retry policy for content stages', async () => {
    const f = contextFixture();
    f.plan.stages[0].retryPolicy = 'not-enabled';
    const fake = adapters();
    fake.generateContent
      .mockRejectedValueOnce(new Error('format miss'))
      .mockResolvedValueOnce('would be unsafe');
    const result = await runCompiledTurn({
      plan: f.plan,
      store: f.store,
      adapters: fake,
      retry: { contentAttempts: 2 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toBe('format miss');
    expect(fake.generateContent).toHaveBeenCalledTimes(1);
    expect(fake.executeAction).not.toHaveBeenCalled();
    expect(result.stages[0].attempts).toBe(1);
  });

  it('does not retry effectful action failures', async () => {
    const f = contextFixture();
    const fake = adapters();
    fake.executeAction.mockRejectedValueOnce(new Error('delivery uncertain'));
    const result = await runCompiledTurn({
      plan: f.plan,
      store: f.store,
      adapters: fake,
      retry: { contentAttempts: 3 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toBe('delivery uncertain');
    expect(fake.generateContent).toHaveBeenCalledTimes(1);
    expect(fake.executeAction).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toMatchObject({ contentCalls: 1, actionCalls: 1, variableWrites: 1 });
  });

  it('rechecks invalidated inputs before each stage', async () => {
    const f = contextFixture();
    f.store.write({
      id: f.context.GH.id,
      value: { kind: 'facts', facts: [{ sourceId: 'new', text: 'new facts' }] },
      inputs: [],
      producer: { kind: 'context', sourceId: 'GH' },
      provenance: 'authoritative',
      visibility: privateToAlice,
      retention: 'turn',
    });
    const fake = adapters();
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toContain('superseded or invalidated');
    expect(result.diagnostics).toMatchObject({ contentCalls: 0, actionCalls: 0, variableWrites: 0 });
    expect(fake.generateContent).not.toHaveBeenCalled();
  });

  it('cancels before running an effectful stage', async () => {
    const f = contextFixture();
    const fake = adapters();
    const abort = new AbortController();
    fake.generateContent.mockImplementationOnce(async () => {
      abort.abort();
      return 'stop here';
    });
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake, signal: abort.signal });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.diagnostics).toMatchObject({ contentCalls: 1, actionCalls: 0, variableWrites: 0 });
    expect(fake.executeAction).not.toHaveBeenCalled();
    expect(result.stages.map((stage) => stage.status)).toEqual(['cancelled', 'blocked']);
  });

  it('reports unsupported stage kinds without calling adapters', async () => {
    const f = contextFixture();
    const fake = adapters();
    f.plan.stages[0].kind = 'await-user';
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected scheduler failure.');
    expect(result.error).toContain('No runner');
    expect(fake.generateContent).not.toHaveBeenCalled();
    expect(fake.executeAction).not.toHaveBeenCalled();
  });

  it('creates continuation checkpoints from realized outputs and uncommitted future beats', async () => {
    const f = contextFixture();
    const fake = adapters();
    fake.executeAction.mockRejectedValueOnce(new Error('delivery uncertain'));
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake });
    expect(result.ok).toBe(false);
    const checkpoint = createContinuationCheckpoint(f.plan, result, f.store);
    expect(Object.values(checkpoint.realizedOutputs).map((ref) => ref.kind)).toEqual(['text']);
    expect(checkpoint.completedBeatIds).toEqual([]);
    expect(checkpoint.revisableBeatIds).toEqual([f.plan.beats[0].id]);
    expect(checkpoint.remainingStageIds).toEqual([f.plan.stages[1].id]);
    expect(checkpoint.continuationsRemaining).toBe(1);
  });

  it('marks receipt-backed beats complete only after the receipt is committed', async () => {
    const f = contextFixture();
    const result = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: adapters() });
    expect(result.ok).toBe(true);
    const checkpoint = createContinuationCheckpoint(f.plan, result, f.store);
    expect(checkpoint.completedBeatIds).toEqual([f.plan.beats[0].id]);
    expect(checkpoint.revisableBeatIds).toEqual([]);
    expect(checkpoint.remainingStageIds).toEqual([]);
  });

  it('resumes from a prior failed attempt without repeating an already-succeeded stage (S8 retry-without-regenerating)', async () => {
    const f = contextFixture();
    const fake = adapters();
    fake.executeAction.mockRejectedValueOnce(new Error('delivery uncertain'));
    const first = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: fake });
    expect(first.ok).toBe(false);
    expect(fake.generateContent).toHaveBeenCalledTimes(1);
    expect(fake.executeAction).toHaveBeenCalledTimes(1);
    const completedStageIds = first.stages.filter((stage) => stage.status === 'succeeded').map((stage) => stage.stageId);
    expect(completedStageIds).toEqual([f.plan.stages[0].id]);

    const second = await runCompiledTurn({
      plan: f.plan,
      store: f.store,
      adapters: fake,
      resume: { completedStageIds, outputs: first.outputs },
    });
    expect(second.ok).toBe(true);
    // The content draft is not regenerated; only the previously failed action stage retries.
    expect(fake.generateContent).toHaveBeenCalledTimes(1);
    expect(fake.executeAction).toHaveBeenCalledTimes(2);
    expect(second.stages.map((stage) => stage.status)).toEqual(['succeeded', 'succeeded']);
  });
});
