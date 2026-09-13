import { describe, expect, it } from 'vitest';
import { VariableStore } from './variableStore';
import { assertReferenceType, assertStageKind, type TurnPlan, type VariableRecord } from './contracts';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const draft = (id: string, patch: Partial<Omit<VariableRecord, 'ref' | 'scope'>> = {}) => ({
  id, value: { kind: 'text' as const, text: 'Hello' },
  producer: { kind: 'context' as const, sourceId: 'input' }, inputs: [],
  provenance: 'observed' as const, visibility: { kind: 'shared' as const }, retention: 'draft' as const,
  ...patch,
});

describe('staged contracts and variable revisions', () => {
  it('round-trips a plan while keeping beat order separate from stage dependencies', () => {
    const store = new VariableStore(scope);
    const context = store.write(draft('context'));
    const plan: TurnPlan = {
      version: 'staged-v1',
      context: { scope, catalogRevision: 'catalog@1', GH: context, LM: context, OC: context, instructions: { writer: context } },
      stages: [{ id: 'writer', kind: 'generate-content', inputs: [context], outputs: [{ id: 'draft', kind: 'text' }], dependencies: [], instructions: context }],
      beats: [
        { id: 'message', content: [context], visibility: { kind: 'shared' }, requiresReceipts: [] },
        { id: 'narration', content: [context], visibility: { kind: 'shared' }, requiresReceipts: [] },
        { id: 'second-message', content: [context], visibility: { kind: 'shared' }, requiresReceipts: [] },
      ],
      lockedArguments: {}, limits: { beats: 16, calls: 16, generations: 2, continuations: 1 },
    };
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    expect(plan.beats.map((beat) => beat.id)).toEqual(['message', 'narration', 'second-message']);
    expect(plan.stages).toHaveLength(1);
  });
  it('rejects unknown stage kinds and mismatched typed references', () => {
    expect(() => assertStageKind('execute-arbitrary-code')).toThrow('Unknown');
    expect(() => assertStageKind('generate-content')).not.toThrow();
    expect(() => assertReferenceType({ id: 'image', revision: 1, kind: 'artifact', scope }, 'text')).toThrow('text');
    expect(() => assertReferenceType({ id: 'text', revision: 0, kind: 'text', scope }, 'text')).toThrow('versioned');
  });
  it('keeps detached revisions and supports JSON round trips', () => {
    const store = new VariableStore(scope);
    const input = draft('message');
    const first = store.write(input);
    input.value = { kind: 'text', text: 'Changed outside' };
    const second = store.write({ ...input, value: { kind: 'text', text: 'Second' } });
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(store.read(first, scope, 'system').value).toEqual({ kind: 'text', text: 'Hello' });
    const record = store.read(second, scope, 'system');
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
    record.value = { kind: 'text', text: 'Mutated copy' };
    expect(store.read(second, scope, 'system').value).toEqual({ kind: 'text', text: 'Second' });
  });
  it('isolates scopes, types and private character inputs', () => {
    const store = new VariableStore(scope);
    const ref = store.write(draft('private', { visibility: { kind: 'characters', characterIds: ['alice'] } }));
    expect(() => store.read(ref, { ...scope, branchId: 'other' }, 'system')).toThrow('scope');
    expect(() => store.read({ ...ref, kind: 'artifact' }, scope, 'system')).toThrow('type');
    expect(() => store.read(ref, scope, { characterId: 'bob' })).toThrow('visible');
    expect(store.read(ref, scope, { characterId: 'alice' }).ref).toEqual(ref);
    expect(() => store.write(draft('leak', { inputs: [ref] }))).toThrow('visibility');
  });
  it('rejects dangling inputs and generated authoritative facts', () => {
    const store = new VariableStore(scope);
    expect(() => store.write(draft('x', { inputs: [{ id: 'missing', kind: 'text', revision: 1, scope }] }))).toThrow('Missing');
    expect(() => store.write(draft('x', { producer: { kind: 'stage', stageId: 'writer' }, provenance: 'authoritative' }))).toThrow('authoritative');
  });
  it('invalidates only dependent uncommitted outputs, retaining old revisions and committed receipts', () => {
    const store = new VariableStore(scope);
    const input = store.write(draft('input'));
    const content = store.write(draft('content', { inputs: [input] }));
    const receipt = store.write(draft('receipt', { inputs: [content], value: { kind: 'receipt', operationId: 'op', receiptId: 'receipt' } }));
    store.markCommitted(receipt);
    const reaction = store.write(draft('reaction', { inputs: [receipt] }));
    const dependent = store.write(draft('dependent', { inputs: [content] }));
    store.write(draft('input', { value: { kind: 'text', text: 'Revised' } }));
    expect(store.isInvalidated(content)).toBe(true);
    expect(store.isInvalidated(dependent)).toBe(true);
    expect(store.isInvalidated(receipt)).toBe(false);
    expect(store.isInvalidated(reaction)).toBe(false);
    expect(store.read(input, scope, 'system').value).toEqual({ kind: 'text', text: 'Hello' });
    expect(() => store.write(draft('retry', { inputs: [content] }))).toThrow('invalidated');
    expect(() => store.write(draft('receipt'))).toThrow('committed');
  });
  it('bounds retained revisions and refuses to reuse an identity with a different type', () => {
    const store = new VariableStore(scope, 2);
    store.write(draft('a'));
    expect(() => store.write(draft('a', { value: { kind: 'artifact', artifactId: 'img', mediaType: 'image' } }))).toThrow('type');
    store.write(draft('b'));
    expect(() => store.write(draft('c'))).toThrow('budget');
  });
  it('rejects foreign inputs even when local IDs and revisions coincide', () => {
    const store = new VariableStore(scope);
    store.write(draft('same'));
    const other = new VariableStore({ ...scope, turnId: 'other' });
    const foreign = other.write(draft('same'));
    expect(() => store.write(draft('output', { inputs: [foreign] }))).toThrow('scope');
  });
  it('does not mutate state on a rejected oversized write', () => {
    const store = new VariableStore(scope, 10, 1000);
    const first = store.write(draft('x'));
    expect(() => store.write(draft('x', { value: { kind: 'text', text: 'x'.repeat(1001) } }))).toThrow('budget');
    expect(store.write(draft('x')).revision).toBe(first.revision + 1);
  });
  it('round-trips through serialize/fromSerialized and JSON, preserving invalidation and commit state (S8 restart-recovery groundwork)', () => {
    const store = new VariableStore(scope);
    const input = store.write(draft('input'));
    const content = store.write(draft('content', { inputs: [input] }));
    const receipt = store.write(draft('receipt', { inputs: [content], value: { kind: 'receipt', operationId: 'op', receiptId: 'receipt' } }));
    store.markCommitted(receipt);
    store.write(draft('input', { value: { kind: 'text', text: 'Revised' } })); // invalidates `content`

    const serialized = store.serialize();
    const roundTripped = JSON.parse(JSON.stringify(serialized));
    expect(roundTripped).toEqual(serialized);

    const restored = VariableStore.fromSerialized(roundTripped);
    expect(restored.read(input, scope, 'system').value).toEqual({ kind: 'text', text: 'Hello' });
    expect(restored.isInvalidated(content)).toBe(true);
    expect(restored.isCommitted(receipt)).toBe(true);
    expect(restored.isInvalidated(receipt)).toBe(false);
    // The restored store still enforces every original invariant, not just replays reads.
    expect(() => restored.write(draft('receipt'))).toThrow('committed');
    expect(() => restored.write(draft('retry', { inputs: [content] }))).toThrow('invalidated');
  });
});
