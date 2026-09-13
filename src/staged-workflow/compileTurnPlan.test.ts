import { describe, expect, it } from 'vitest';
import { compileTurnPlan, type CompileOptions, type RecipeDefinition } from './compileTurnPlan';
import { buildPlanPrompt } from './planPrompt';
import { VariableStore } from './variableStore';
import type { VariableRef } from './contracts';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const privateToAlice = { kind: 'characters' as const, characterIds: ['alice'] };
function fixture() {
  const store = new VariableStore(scope);
  const facts = (id: string) => store.write({ id, value: { kind: 'facts', facts: [] }, inputs: [],
    producer: { kind: 'context', sourceId: id }, provenance: 'authoritative', visibility: privateToAlice, retention: 'turn' });
  const instruction = store.write({ id: 'I', value: { kind: 'text', text: 'Write briefly.' }, inputs: [],
    producer: { kind: 'context', sourceId: 'I' }, provenance: 'observed', visibility: privateToAlice, retention: 'turn' });
  const context = { scope, catalogRevision: 'catalog-1', GH: facts('GH'), LM: facts('LM'), OC: facts('OC'), instructions: { write: instruction } };
  const recipe: RecipeDefinition = {
    id: 'fixture.message', description: 'Draft and deliver a fixture message.', initiators: ['model', 'direct-user'],
    inputs: { history: 'facts', instruction: 'text' }, arguments: { recipient: 'string' },
    retryPolicy: 'regenerate-draft-only',
    steps: [
      { key: 'draft', kind: 'generate-content', output: 'text', inputs: ['history'], instruction: 'instruction', generations: 0 },
      { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['draft'], generations: 0 },
    ],
    validate: ({ args, actorId, catalog }) => {
      if (actorId !== 'alice' || args.recipient !== 'bob' || !catalog.characterIds.includes(String(args.recipient))) throw new Error('Recipient access denied.');
    },
  };
  let allocations = 0;
  const options: CompileOptions = { context, store, catalog: { scope, revision: 'catalog-1', characterIds: ['alice', 'bob'] },
    recipes: [recipe], initiator: 'model', limits: { beats: 8, calls: 8, generations: 2, continuations: 1 },
    allocateId: () => `runtime-${++allocations}` };
  const instance = (id: string) => ({ id, recipe: recipe.id, purpose: 'Ask Bob about the meeting.', actorId: 'alice', visibility: privateToAlice,
    args: { recipient: 'bob' }, inputs: { history: { source: 'variable', ref: context.GH }, instruction: { source: 'variable', ref: instruction } }, dependencies: [] });
  const output = (instanceId: string, output = 'receipt', kind = 'receipt') => ({ source: 'output', instanceId, output, kind });
  const plan = { version: 'staged-v1', catalogRevision: 'catalog-1', continuations: 0, instances: [instance('first'), instance('second')],
    beats: [{ id: 'b2', visibility: privateToAlice, content: [output('second')], requiresReceipts: [output('second')] },
      { id: 'b1', visibility: privateToAlice, content: [output('first', 'draft', 'text')], requiresReceipts: [] }] };
  return { options, plan, instance, output, recipe, store, instruction, allocations: () => allocations };
}

describe('compact plan compilation', () => {
  it('expands separate calls, keeps presentation order and binds future outputs without store writes', () => {
    const f = fixture();
    const result = compileTurnPlan(JSON.stringify(f.plan), f.options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.stages.map((s) => s.kind)).toEqual(['generate-content', 'execute-action', 'generate-content', 'execute-action']);
    expect(result.plan.beats.map((b) => b.alias)).toEqual(['b2', 'b1']);
    expect(result.plan.scene[0].purpose).toBe('Ask Bob about the meeting.');
    const first = result.plan.stages[0];
    expect(result.plan.stages[1].inputs).toEqual([{ source: 'output', stageId: first.id, outputId: first.output.id, kind: 'text' }]);
    expect(result.plan.stages[1].dependencies).toEqual([{ stageId: first.id, kind: 'content' }]);
    expect(result.plan.cost).toEqual({ beats: 2, calls: 2, generations: 0, continuations: 0 });
    expect(() => f.store.read({ id: first.output.id, revision: 1, kind: 'text', scope }, scope, 'system')).toThrow('Missing');
    f.plan.instances[0].args.recipient = 'mallory';
    expect(result.plan.stages[0].lockedArguments).toEqual({ recipient: 'bob' });
  });

  it.each([
    ['bad JSON', () => '{'],
    ['wrong version', (p: Record<string, unknown>) => ({ ...p, version: 7 })],
    ['unknown field', (p: Record<string, unknown>) => ({ ...p, execute: true })],
    ['oversized payload', () => ' '.repeat(262145)],
  ])('rejects %s before allocating execution identities', (_name, change) => {
    const f = fixture();
    expect(compileTurnPlan(change(f.plan), f.options).ok).toBe(false);
    expect(f.allocations()).toBe(0);
  });

  it('reports precise failure paths instead of the generic "plan" fallback', () => {
    const f = fixture();
    const badReceipt = { ...f.plan, beats: [{ ...f.plan.beats[0], requiresReceipts: ['i2'] }, f.plan.beats[1]] };
    const receiptResult = compileTurnPlan(badReceipt, f.options);
    expect(receiptResult.ok).toBe(false);
    if (!receiptResult.ok) expect(receiptResult.issues[0].path).toBe('beats.b2.requiresReceipts[0]');

    const f2 = fixture();
    const badContinuations = { ...f2.plan, continuations: [] };
    const continuationsResult = compileTurnPlan(badContinuations, f2.options);
    expect(continuationsResult.ok).toBe(false);
    if (!continuationsResult.ok) expect(continuationsResult.issues[0].path).toBe('continuations');
  });

  it('rejects unknown recipes, actors, arguments and denied access', () => {
    for (const change of [
      (p: ReturnType<typeof fixture>['plan']) => { p.instances[0].recipe = 'not-installed'; },
      (p: ReturnType<typeof fixture>['plan']) => { p.instances[0].actorId = 'mallory'; },
      (p: ReturnType<typeof fixture>['plan']) => { p.instances[0].args.recipient = 'alice'; },
      (p: ReturnType<typeof fixture>['plan']) => { Object.assign(p.instances[0].args, { amount: 1 }); },
    ]) {
      const f = fixture(); change(f.plan);
      expect(compileTurnPlan(f.plan, f.options).ok).toBe(false);
      expect(f.allocations()).toBe(0);
    }
  });

  it('rejects duplicate aliases, dangling outputs, wrong types and cycles', () => {
    const f = fixture();
    const cases = [
      { ...f.plan, instances: [f.instance('first'), f.instance('first')] },
      { ...f.plan, beats: [{ ...f.plan.beats[0], content: [f.output('missing')] }] },
      { ...f.plan, beats: [{ ...f.plan.beats[0], content: [f.output('first', 'draft', 'artifact')] }] },
      { ...f.plan, instances: f.plan.instances.map((s, i) => ({ ...s, dependencies: [{ instanceId: i ? 'first' : 'second', kind: 'state' }] })) },
      { ...f.plan, instances: [{ ...f.instance('first'), dependencies: [{ instanceId: 'second', kind: 'guess' }] }, f.instance('second')] },
    ];
    for (const plan of cases) expect(compileTurnPlan(plan, f.options).ok).toBe(false);
    expect(f.allocations()).toBe(0);
  });

  it('orders cross-instance content by its producer and rejects cycles through inputs', () => {
    const f = fixture();
    const continuation: RecipeDefinition = { ...f.recipe, id: 'fixture.continuation', inputs: { history: 'text', instruction: 'text' } };
    f.options.recipes = [f.recipe, continuation];
    const second = { ...f.instance('second'), recipe: continuation.id,
      inputs: { ...f.instance('second').inputs, history: f.output('first', 'draft', 'text') } };
    const plan = { ...f.plan, instances: [second, f.instance('first')] };
    const result = compileTurnPlan(plan, f.options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstDraft = result.plan.stages[2];
    expect(result.plan.executionOrder[0]).toBe(firstDraft.id);
    expect(result.plan.stages[0].inputs[0]).toEqual({ source: 'output', stageId: firstDraft.id, outputId: firstDraft.output.id, kind: 'text' });
    expect(compileTurnPlan({ ...plan, instances: [second, { ...second, id: 'first',
      inputs: { ...second.inputs, history: f.output('second', 'draft', 'text') } }] }, f.options).ok).toBe(false);
  });

  it('gives recipe validation exact resolved inputs for semantic checks', () => {
    const f = fixture();
    f.recipe.validate = ({ inputs }) => {
      if (inputs.history.record?.provenance !== 'observed') throw new Error('History must be observed.');
    };
    const result = compileTurnPlan(f.plan, f.options);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toBe('History must be observed.');
    expect(f.allocations()).toBe(0);
  });

  it('rejects cross-scope, wrong-type, private and invalidated exact revisions', () => {
    const f = fixture();
    const original = f.options.context.GH;
    const derived = f.store.write({ id: 'derived', value: { kind: 'facts', facts: [] }, inputs: [original],
      producer: { kind: 'stage', stageId: 'earlier' }, provenance: 'generated', visibility: privateToAlice, retention: 'draft' });
    f.store.write({ ...f.store.read(original, scope, 'system'), id: original.id, value: { kind: 'facts', facts: [] } });
    for (const ref of [{ ...original, scope: { ...scope, turnId: 'other' } }, { ...original, kind: 'text' }, derived]) {
      const plan = structuredClone(f.plan);
      plan.instances[0].inputs.history.ref = ref as VariableRef;
      expect(compileTurnPlan(plan, f.options).ok).toBe(false);
    }
    const plan = structuredClone(f.plan);
    plan.instances[0].visibility.characterIds = ['alice', 'bob'];
    expect(compileTurnPlan(plan, f.options).ok).toBe(false);
    plan.instances[0].visibility = privateToAlice;
    plan.beats[0].visibility.characterIds = ['bob'];
    expect(compileTurnPlan(plan, f.options).ok).toBe(false);
  });

  it('preserves direct-user arguments and rejects changes, omissions and extra actions', () => {
    const f = fixture();
    f.options.initiator = 'direct-user';
    f.options.directActions = f.plan.instances.map((s) => ({ id: s.id, recipe: s.recipe, actorId: s.actorId, args: { recipient: 'bob' } }));
    expect(compileTurnPlan(f.plan, f.options).ok).toBe(true);
    f.plan.instances[0].args.recipient = 'alice';
    expect(compileTurnPlan(f.plan, f.options).ok).toBe(false);
    f.plan.instances[0].args.recipient = 'bob';
    expect(compileTurnPlan({ ...f.plan, instances: [f.instance('first')] }, f.options).ok).toBe(false);
    expect(compileTurnPlan({ ...f.plan, instances: [...f.plan.instances, f.instance('third')] }, f.options).ok).toBe(false);
  });

  it('counts expanded costs and rejects every exceeded budget before effects', () => {
    for (const [budget, value] of [['beats', 1], ['calls', 1], ['generations', 0], ['continuations', 0]] as const) {
      const f = fixture();
      f.recipe.steps[0].generations = 1;
      f.plan.continuations = 1;
      f.options.limits[budget] = value;
      expect(compileTurnPlan(f.plan, f.options).ok).toBe(false);
      expect(f.allocations()).toBe(0);
    }
  });

  it('fails closed on invalid recipe stage kinds and colliding runtime IDs', () => {
    const f = fixture();
    Object.assign(f.recipe.steps[0], { kind: 'run-code' });
    expect(compileTurnPlan(f.plan, f.options).ok).toBe(false);
    f.recipe.steps[0].kind = 'generate-content';
    f.options.allocateId = () => 'same';
    expect(compileTurnPlan(f.plan, f.options).ok).toBe(false);
  });

  it('allows a generate-content step to output messages but not other structured kinds', () => {
    const f = fixture();
    f.recipe.steps[0].output = 'messages';
    const plan = { ...f.plan, beats: [{ id: 'b1', visibility: privateToAlice, content: [f.output('first', 'draft', 'messages')], requiresReceipts: [] }] };
    expect(compileTurnPlan(plan, f.options).ok).toBe(true);
    f.recipe.steps[0].output = 'facts';
    expect(compileTurnPlan(plan, f.options).ok).toBe(false);
  });

  it('advertises only supplied recipes and scoped inputs, and bypasses planning for direct actions', () => {
    const f = fixture();
    const prompt = buildPlanPrompt(f.options);
    expect(prompt).toContain('fixture.message');
    expect(prompt).not.toContain('social.post');
    expect(prompt).toContain('catalog-1');
    expect(prompt).toContain('revision');
    expect(() => buildPlanPrompt({ ...f.options, initiator: 'direct-user' })).toThrow('Direct');
  });
});
