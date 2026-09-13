import { describe, expect, it, vi } from 'vitest';
import { requestStagedPlan } from './planCall';
import type { CompileOptions, RecipeDefinition } from './compileTurnPlan';
import { VariableStore } from './variableStore';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const shared = { kind: 'shared' as const };

function fixtureOptions(initiator: CompileOptions['initiator'] = 'model'): CompileOptions {
  const store = new VariableStore(scope);
  const facts = (id: string) => store.write({ id, value: { kind: 'facts', facts: [] }, inputs: [],
    producer: { kind: 'context', sourceId: id }, provenance: 'authoritative', visibility: shared, retention: 'turn' });
  const instruction = store.write({ id: 'I', value: { kind: 'text', text: 'Write briefly.' }, inputs: [],
    producer: { kind: 'context', sourceId: 'I' }, provenance: 'observed', visibility: shared, retention: 'turn' });
  const context = { scope, catalogRevision: 'catalog-1', GH: facts('GH'), LM: facts('LM'), OC: facts('OC'), instructions: { write: instruction } };
  const recipe: RecipeDefinition = {
    id: 'fixture.message', description: 'Draft a fixture message.', initiators: ['model', 'direct-user'],
    inputs: { history: 'facts', instruction: 'text' }, arguments: { recipient: 'string' },
    retryPolicy: 'regenerate-draft-only',
    steps: [{ key: 'draft', kind: 'generate-content', output: 'text', inputs: ['history'], instruction: 'instruction', generations: 0 }],
    validate: () => {},
  };
  return { context, store, catalog: { scope, revision: 'catalog-1', characterIds: ['alice', 'bob'] },
    recipes: [recipe], initiator, limits: { beats: 8, calls: 8, generations: 2, continuations: 1 },
    allocateId: () => 'runtime-1' };
}

describe('requestStagedPlan', () => {
  it('sends the managed plan prompt and returns the parsed plan object', async () => {
    const planJson = JSON.stringify({ version: 'staged-v1', instances: [] });
    const complete = vi.fn().mockResolvedValue({ text: planJson });
    const result = await requestStagedPlan({ complete }, fixtureOptions());
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0][0];
    expect(request.prompt).toContain('staged-v1');
    expect(request.prompt).toContain('fixture.message');
    expect(result).toEqual({ version: 'staged-v1', instances: [] });
  });

  it('accepts one enclosing JSON fence and strips leading marked reasoning', async () => {
    const planJson = JSON.stringify({ ok: true });
    const complete = vi.fn().mockResolvedValue({ text: `<think>drafting</think>\n\`\`\`json\n${planJson}\n\`\`\`` });
    expect(await requestStagedPlan({ complete }, fixtureOptions())).toEqual({ ok: true });
  });

  it('throws a staged-specific message on malformed JSON without guessing', async () => {
    const complete = vi.fn().mockResolvedValue({ text: '{not json' });
    await expect(requestStagedPlan({ complete }, fixtureOptions())).rejects.toThrow('Staged plan reply is not valid JSON');
  });

  it('rejects direct-user initiators before calling the model', async () => {
    const complete = vi.fn();
    await expect(requestStagedPlan({ complete }, fixtureOptions('direct-user'))).rejects.toThrow('bypass speculative planning');
    expect(complete).not.toHaveBeenCalled();
  });
});
