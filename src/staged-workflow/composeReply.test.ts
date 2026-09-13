import { describe, expect, it, vi } from 'vitest';
import { compileTurnPlan, type CompileOptions } from './compileTurnPlan';
import { composeReply } from './composeReply';
import { stagedRecipeDefinitions } from './recipeInventory';
import { runCompiledTurn, type StagedSchedulerAdapters } from './scheduler';
import { VariableStore } from './variableStore';
import type { TurnScope } from './contracts';

const scope: TurnScope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const privateToAlice = { kind: 'characters' as const, characterIds: ['alice'] };

function fixture() {
  const store = new VariableStore(scope);
  const facts = (id: string) => store.write({
    id, value: { kind: 'facts', facts: [{ sourceId: id, text: `${id} facts` }] }, inputs: [],
    producer: { kind: 'context', sourceId: id }, provenance: 'authoritative', visibility: privateToAlice, retention: 'turn',
  });
  const instruction = store.write({
    id: 'I', value: { kind: 'text', text: 'Write briefly.' }, inputs: [],
    producer: { kind: 'context', sourceId: 'I' }, provenance: 'observed', visibility: privateToAlice, retention: 'turn',
  });
  const context = { scope, catalogRevision: 'catalog-1', GH: facts('GH'), LM: facts('LM'), OC: facts('OC'), instructions: { write: instruction } };
  const options: CompileOptions = {
    context, store, catalog: { scope, revision: 'catalog-1', characterIds: ['alice', 'bob'] },
    recipes: stagedRecipeDefinitions(), initiator: 'model',
    limits: { beats: 8, calls: 8, generations: 2, continuations: 1 },
    allocateId: (() => { let id = 0; return () => `runtime-${++id}`; })(),
  };
  const planInput = {
    version: 'staged-v1', catalogRevision: 'catalog-1', continuations: 0,
    instances: [
      {
        id: 'message', recipe: 'whatsup.message', purpose: 'Send Bob a check-in.', actorId: 'alice', visibility: privateToAlice,
        args: { recipientId: 'bob' },
        inputs: { context: { source: 'variable', ref: context.GH }, instructions: { source: 'variable', ref: instruction } },
        dependencies: [],
      },
      {
        id: 'narrate', recipe: 'narration.speech', purpose: 'Describe the room.', actorId: 'alice', visibility: privateToAlice,
        args: {},
        inputs: { context: { source: 'variable', ref: context.GH }, instructions: { source: 'variable', ref: instruction } },
        dependencies: [],
      },
    ],
    // Presentation order is arbitrary and independent of execution/dependency order:
    // the message beat comes first here even though it has no dependency on narration.
    beats: [
      {
        id: 'b-message', visibility: privateToAlice,
        content: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
        requiresReceipts: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
      },
      {
        id: 'b-narration', speakerId: 'alice', visibility: privateToAlice,
        content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }],
        requiresReceipts: [],
      },
    ],
  };
  const compiled = compileTurnPlan(planInput, options);
  if (!compiled.ok) throw new Error(compiled.issues.map((issue) => issue.message).join('; '));
  return { store, plan: compiled.plan };
}

function adapters(): StagedSchedulerAdapters {
  return {
    generateContent: vi.fn(async ({ stage }) => stage.recipeId === 'narration.speech' ? 'The room is quiet.' : 'Hey Bob, checking in.'),
    executeAction: vi.fn(async ({ stage }) => ({ kind: 'receipt' as const, operationId: stage.id, receiptId: 'message:42' })),
  };
}

describe('composeReply', () => {
  it('composes text and receipt beats in presentation order, independent of execution order', async () => {
    const f = fixture();
    const [messageBeatId, narrationBeatId] = f.plan.beats.map((beat) => beat.id);
    const run = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: adapters() });
    expect(run.ok).toBe(true);
    const result = composeReply(f.plan, run, f.store);
    expect(result.incompleteBeatIds).toEqual([]);
    expect(result.items).toEqual([
      { kind: 'receipt', beatId: messageBeatId, operationId: expect.any(String), receiptId: 'message:42' },
      { kind: 'text', beatId: narrationBeatId, speakerId: 'alice', text: 'The room is quiet.' },
    ]);
  });

  it('reports every unfinished beat as incomplete rather than partially emitting it', async () => {
    const f = fixture();
    const [messageBeatId, narrationBeatId] = f.plan.beats.map((beat) => beat.id);
    const failingAdapters: StagedSchedulerAdapters = {
      generateContent: vi.fn(async ({ stage }) => stage.recipeId === 'narration.speech' ? 'The room is quiet.' : 'Hey Bob.'),
      executeAction: vi.fn(async () => { throw new Error('delivery failed'); }),
    };
    const run = await runCompiledTurn({ plan: f.plan, store: f.store, adapters: failingAdapters });
    expect(run.ok).toBe(false);
    const result = composeReply(f.plan, run, f.store);
    // The message's execute-action stage fails before the independent narration stage
    // even runs (sequential scheduling), so neither beat's content is realized.
    expect(result.incompleteBeatIds).toEqual([messageBeatId, narrationBeatId]);
    expect(result.items).toEqual([]);
  });

  it('never emits an uncommitted receipt, even for a beat that forgot to declare requiresReceipts', () => {
    const store = new VariableStore(scope);
    const ref = store.write({
      id: 'stray-receipt', value: { kind: 'receipt', operationId: 'op-1', receiptId: 'message:99' }, inputs: [],
      producer: { kind: 'stage', stageId: 'stage-1' }, provenance: 'observed', visibility: privateToAlice, retention: 'turn',
    });
    // Deliberately not committed, simulating a plan that references content directly
    // without also declaring it in requiresReceipts.
    const plan = {
      version: 'staged-v1' as const, context: { scope, catalogRevision: 'c', GH: ref, LM: ref, OC: ref, instructions: {} },
      stages: [], executionOrder: [], scene: [], limits: { beats: 1, calls: 0, generations: 0, continuations: 0 },
      cost: { beats: 1, calls: 0, generations: 0, continuations: 0 },
      beats: [{ id: 'b-stray', alias: 'stray', visibility: privateToAlice,
        content: [{ source: 'variable' as const, ref }], requiresReceipts: [] }],
    };
    const run = { ok: true as const, stages: [], outputs: {},
      diagnostics: { startedAtMs: 0, endedAtMs: 0, durationMs: 0, contentCalls: 0, actionCalls: 0, variableWrites: 0 } };
    const result = composeReply(plan, run, store);
    expect(result.incompleteBeatIds).toEqual(['b-stray']);
    expect(result.items).toEqual([]);
  });
});
