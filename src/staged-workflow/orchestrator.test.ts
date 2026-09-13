import { describe, expect, it, vi } from 'vitest';
import type { NodeLlmResult } from '../llm/types';
import { compileTurnPlan, type CompileOptions } from './compileTurnPlan';
import { compileAndRunStagedTurn, runStagedTurn } from './orchestrator';
import { stagedRecipeDefinitions } from './recipeInventory';
import { VariableStore } from './variableStore';
import type { StagedSchedulerAdapters } from './scheduler';
import type { TurnScope } from './contracts';
import type { ActionCatalog } from '../actions/contracts';

const scope: TurnScope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const privateToAlice = { kind: 'characters' as const, characterIds: ['alice'] };

function fixture() {
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
    value: { kind: 'text', text: 'Write a short hello.' },
    inputs: [],
    producer: { kind: 'context', sourceId: 'I' },
    provenance: 'observed',
    visibility: privateToAlice,
    retention: 'turn',
  });
  const context = { scope, catalogRevision: 'catalog-1', GH: facts('GH'), LM: facts('LM'), OC: facts('OC'), instructions: { write: instruction } };
  let nextId = 0;
  const options: CompileOptions = {
    context,
    store,
    catalog: { scope, revision: 'catalog-1', characterIds: ['alice', 'bob'] },
    recipes: stagedRecipeDefinitions(),
    initiator: 'model',
    limits: { beats: 8, calls: 8, generations: 2, continuations: 1 },
    allocateId: () => `runtime-${++nextId}`,
  };
  const planInput = {
    version: 'staged-v1',
    catalogRevision: 'catalog-1',
    continuations: 0,
    instances: [{
      id: 'message',
      recipe: 'whatsup.message',
      purpose: 'Say hello to Bob.',
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
  return { store, plan: compiled.plan, planInput, compileOptions: options };
}

describe('staged orchestrator', () => {
  it('runs content through NodeLlmApi and actions through an injected adapter', async () => {
    const f = fixture();
    const llmResult: NodeLlmResult = {
      text: 'Hello Bob.',
      stats: { inputTokens: 1, outputTokens: 2, totalTokens: 3, durationMs: 4 },
      connection: {
        id: 'c1',
        kind: 'llm',
        label: 'Test LLM',
        providerKind: 'lm-studio',
        baseUrl: 'http://127.0.0.1:1234',
        apiKey: '',
        model: 'test-model',
      },
    };
    const llm = { complete: vi.fn(async () => llmResult) };
    const executeAction = vi.fn<StagedSchedulerAdapters['executeAction']>(async ({ stage, inputs }) => ({
      kind: 'receipt',
      operationId: stage.id,
      receiptId: `sent:${inputs[0].value.kind === 'text' ? inputs[0].value.text : 'missing'}`,
    }));
    const result = await runStagedTurn({
      plan: f.plan,
      store: f.store,
      llm,
      executeAction,
      content: { connectionId: 'c1', maxTokens: 64 },
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toMatchObject({ contentCalls: 1, actionCalls: 1, variableWrites: 2 });
    expect(llm.complete).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'c1', maxTokens: 64 }));
    expect(executeAction).toHaveBeenCalledTimes(1);
    const receipt = Object.values(result.outputs).find((output) => output.kind === 'receipt');
    expect(receipt && f.store.read(receipt, scope, { characterId: 'alice' }).value).toEqual({
      kind: 'receipt',
      operationId: f.plan.stages[1].id,
      receiptId: 'sent:Hello Bob.',
    });
  });

  it('compiles, runs through a live action bridge shape, and returns a continuation checkpoint', async () => {
    const f = fixture();
    const llmResult: NodeLlmResult = {
      text: 'Bridge hello.',
      stats: { inputTokens: 1, outputTokens: 2, totalTokens: 3, durationMs: 4 },
      connection: {
        id: 'c1',
        kind: 'llm',
        label: 'Test LLM',
        providerKind: 'lm-studio',
        baseUrl: 'http://127.0.0.1:1234',
        apiKey: '',
        model: 'test-model',
      },
    };
    const llm = { complete: vi.fn(async () => llmResult) };
    const actionCatalog: ActionCatalog = {
      scope: { ...scope, catalogId: 'catalog-1' },
      entries: [
        { id: 'alice', handle: 'person_1', kind: 'character', saveId: 'save', branchId: 'branch', state: 'available', capabilities: ['whatsup.send'], allowedRecipientIds: ['bob'] },
        { id: 'bob', handle: 'person_2', kind: 'character', saveId: 'save', branchId: 'branch', state: 'available', capabilities: ['whatsup.receive'] },
      ],
    };
    const actionBridge = {
      getCatalog: () => structuredClone(actionCatalog),
      execute: vi.fn(async () => ({
        scope: actionCatalog.scope,
        blocks: [{ type: 'action' as const, id: 'block-1', operationId: 'operation-1' }],
        operations: [{
          id: 'operation-1',
          status: 'committed' as const,
          result: { type: 'messenger.sent' as const, messageId: 12, fromId: 'alice', toId: 'bob', text: 'Bridge hello.' },
        }],
      })),
    };
    const result = await compileAndRunStagedTurn({
      ...f.compileOptions,
      planInput: f.planInput,
      store: f.store,
      llm,
      actionBridge,
    });
    expect(result.compiled).toBe(true);
    if (!result.compiled) throw new Error('Expected staged run.');
    expect(result.run.ok).toBe(true);
    expect(result.checkpoint.completedBeatIds).toHaveLength(1);
    expect(result.checkpoint.revisableBeatIds).toEqual([]);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(actionBridge.execute).toHaveBeenCalledWith(expect.objectContaining({
      blocks: [expect.objectContaining({
        intent: expect.objectContaining({ from: 'person_1', to: 'person_2', text: 'Bridge hello.' }),
      })],
    }));
  });

  it('does not call providers or actions when compact-plan compilation fails', async () => {
    const f = fixture();
    const llm = { complete: vi.fn(async () => { throw new Error('should not run'); }) };
    const actionBridge = {
      getCatalog: vi.fn(() => ({ scope: { ...scope, catalogId: 'catalog-1' }, entries: [] })),
      execute: vi.fn(async () => { throw new Error('should not run'); }),
    };
    const result = await compileAndRunStagedTurn({
      ...f.compileOptions,
      planInput: { ...f.planInput, catalogRevision: 'old-catalog' },
      store: f.store,
      llm,
      actionBridge,
    });
    expect(result.compiled).toBe(false);
    expect(llm.complete).not.toHaveBeenCalled();
    expect(actionBridge.execute).not.toHaveBeenCalled();
  });
});
