import { describe, expect, it, vi } from 'vitest';
import { compileActionReply } from './compileReply';
import type { ActionCatalog, ActionScope } from './contracts';

const scope: ActionScope = { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog-1' };
function catalog(): ActionCatalog {
  return {
    scope: { ...scope },
    entries: [
      { handle: 'person_1', id: 'alice-id', kind: 'character', state: 'available', saveId: 'save', branchId: 'branch', capabilities: ['whatsup.send', 'image.generate'] },
      { handle: 'person_2', id: 'bob-id', kind: 'character', state: 'available', saveId: 'save', branchId: 'branch', capabilities: ['whatsup.receive'] },
      { handle: 'image_1', id: 'image-id', kind: 'image', state: 'available', saveId: 'save', branchId: 'branch', accessibleTo: ['alice-id'] },
    ],
  };
}
const send = () => ({ type: 'messenger.send', app: 'whatsup', from: 'person_1', to: 'person_2', text: 'Look!' });
const envelope = (intent: unknown) => ({ version: 1, catalogId: scope.catalogId, blocks: [{ type: 'action', intent }] });
const ids = () => { let next = 0; return vi.fn(() => `runtime-${++next}`); };

describe('strict action reply compilation', () => {
  it('accepts empty and text-only replies without interpreting legacy markers', () => {
    expect(compileActionReply({ version: 1, catalogId: scope.catalogId, blocks: [] }, catalog(), scope, ids())).toMatchObject({ ok: true, plan: { operations: [], blocks: [] } });
    const text = '[send-message] {"type":"messenger.send"}';
    expect(compileActionReply({ version: 1, catalogId: scope.catalogId, blocks: [{ type: 'text', text }] }, catalog(), scope, ids())).toMatchObject({ ok: true, plan: { operations: [], blocks: [{ type: 'text', text, provisional: true }] } });
  });

  it('preserves repeated sends and placement with distinct runtime-owned identities', () => {
    const input = { version: 1, catalogId: scope.catalogId, blocks: [
      { type: 'text', text: 'Before' }, { type: 'action', intent: send() },
      { type: 'text', text: 'After' }, { type: 'action', intent: send() },
    ] };
    const before = structuredClone(input);
    const result = compileActionReply(input, catalog(), scope, ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.blocks.map((block) => block.type)).toEqual(['text', 'action', 'text', 'action']);
    expect(result.plan.operations).toHaveLength(2);
    expect(new Set(result.plan.operations.map((operation) => operation.id)).size).toBe(2);
    expect(result.plan.operations[0]).toMatchObject({ status: 'validated', scope, action: { type: 'messenger.send', fromId: 'alice-id', toId: 'bob-id' } });
    expect(input).toEqual(before);
  });

  it('binds stored images by stable identity, not narrative text', () => {
    const result = compileActionReply(envelope({ ...send(), attachment: { type: 'stored_image', ref: 'image_1' } }), catalog(), scope, ids());
    expect(result).toMatchObject({ ok: true, plan: { operations: [{ action: { attachment: { type: 'artifact', artifactId: 'image-id' } } }] } });
  });

  it.each([
    ['unknown action', { ...send(), type: 'invented.action' }, 'unknown-action'],
    ['unknown contact', { ...send(), to: 'Bob' }, 'unknown-reference'],
    ['wrong reference type', { ...send(), to: 'image_1' }, 'wrong-reference-type'],
    ['unsupported app', { ...send(), app: 'fotogram' }, 'unsupported-capability'],
    ['model supplied ID', { ...send(), operationId: 'fake' }, 'invalid-shape'],
    ['future artifact', { ...send(), attachment: { type: 'stored_image', ref: 'future_image' } }, 'unknown-reference'],
    ['self message', { ...send(), to: 'person_1' }, 'invalid-destination'],
    ['empty message', { ...send(), text: '  ' }, 'invalid-shape'],
  ])('rejects %s', (_label, intent, code) => {
    const allocate = ids();
    const result = compileActionReply(envelope(intent), catalog(), scope, allocate);
    expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect(allocate).not.toHaveBeenCalled();
  });

  it.each(['stale', 'unavailable'] as const)('rejects %s catalog entries', (state) => {
    const context = catalog();
    context.entries[1].state = state;
    expect(compileActionReply(envelope(send()), context, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'unavailable-reference' }] });
  });

  it.each(['saveId', 'branchId'] as const)('rejects cross-scope %s references', (key) => {
    const context = catalog();
    context.entries[1][key] = 'other';
    expect(compileActionReply(envelope(send()), context, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'scope-mismatch' }] });
  });

  it('rejects stale catalogs, duplicate handles and inaccessible images', () => {
    expect(compileActionReply({ ...envelope(send()), catalogId: 'old' }, catalog(), scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'scope-mismatch' }] });
    const duplicate = catalog();
    duplicate.entries.push({ ...duplicate.entries[0], id: 'another-person' });
    expect(compileActionReply(envelope(send()), duplicate, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'ambiguous-reference' }] });
    const denied = catalog();
    const image = denied.entries[2];
    if (image.kind === 'image') image.accessibleTo = [];
    expect(compileActionReply(envelope({ ...send(), attachment: { type: 'stored_image', ref: 'image_1' } }), denied, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'access-denied' }] });
  });

  it('rejects the entire batch before allocating IDs if any action is invalid', () => {
    const allocate = ids();
    const result = compileActionReply({ ...envelope(send()), blocks: [
      { type: 'action', intent: send() }, { type: 'action', intent: { ...send(), to: 'unknown' } },
    ] }, catalog(), scope, allocate);
    expect(result).toMatchObject({ ok: false, issues: [{ path: 'blocks[1].intent.to', code: 'unknown-reference' }] });
    expect(result).not.toHaveProperty('plan');
    expect(allocate).not.toHaveBeenCalled();
  });

  it('checks destination capabilities before compiling image generation dependencies', () => {
    const context = catalog();
    const recipient = context.entries[1];
    if (recipient.kind === 'character') recipient.capabilities = [];
    const intent = { ...send(), attachment: { type: 'generate_image', owner: 'person_1', description: 'A sunset' } };
    expect(compileActionReply(envelope(intent), context, scope, ids())).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-capability' })]) });
    const result = compileActionReply(envelope(intent), catalog(), scope, ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [generation, delivery] = result.plan.operations;
    expect(generation.action).toEqual({ type: 'image.generate', ownerId: 'alice-id', description: 'A sunset' });
    expect(delivery).toMatchObject({ dependsOn: [generation.id], action: { attachment: { type: 'operation-result', operationId: generation.id } } });
    expect(result.plan.blocks).toEqual([{ type: 'action', id: delivery.replyBlockId, operationId: delivery.id }]);
  });

  it('supports generation without delivery and rejects incomplete or extra envelope fields', () => {
    expect(compileActionReply(envelope({ type: 'image.generate', owner: 'person_1', description: 'Sunset' }), catalog(), scope, ids())).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'image.generate' } }] } });
    for (const input of ['{"version":1', { ...envelope(send()), operationId: 'model-id' }, { version: 1 }, null]) {
      expect(compileActionReply(input, catalog(), scope, ids()).ok).toBe(false);
    }
  });

  it('does not accept prototype property names as registered actions', () => {
    for (const type of ['constructor', '__proto__', 'toString']) {
      expect(compileActionReply(envelope({ ...send(), type }), catalog(), scope, ids())).toMatchObject({
        ok: false, issues: [{ code: 'unknown-action' }],
      });
    }
  });

  it('reports one focused issue per invalid block without returning a partial plan', () => {
    const result = compileActionReply({ ...envelope(send()), blocks: [
      { type: 'action', intent: { ...send(), to: 'missing' } },
      { type: 'text', text: 42 },
    ] }, catalog(), scope, ids());
    expect(result).toMatchObject({ ok: false, issues: [
      { path: 'blocks[0].intent.to', code: 'unknown-reference' },
      { path: 'blocks[1].text', code: 'invalid-shape' },
    ] });
    expect(result).not.toHaveProperty('plan');
  });

  it('bounds envelope size and rejects duplicate runtime IDs', () => {
    expect(compileActionReply({ ...envelope(send()), blocks: Array.from({ length: 129 }, () => ({ type: 'text', text: '' })) }, catalog(), scope, ids())).toMatchObject({ ok: false, issues: [{ path: 'blocks', code: 'invalid-shape' }] });
    expect(compileActionReply(envelope(send()), catalog(), scope, () => 'duplicate')).toMatchObject({ ok: false, issues: [{ code: 'invalid-runtime-id' }] });
  });

  it('requires generation capability and sender access for generated attachments', () => {
    const intent = { ...send(), attachment: { type: 'generate_image', owner: 'person_2', description: 'A sunset' } };
    const context = catalog();
    expect(compileActionReply(envelope(intent), context, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'unsupported-capability' }] });
    const owner = context.entries[1];
    if (owner.kind === 'character') owner.capabilities.push('image.generate');
    expect(compileActionReply(envelope(intent), context, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'access-denied' }] });
  });

  it('checks catalog turn identity and keeps the accepted scope independent of later mutation', () => {
    const context = catalog();
    context.scope.turnId = 'previous-turn';
    expect(compileActionReply(envelope(send()), context, scope, ids())).toMatchObject({ ok: false, issues: [{ code: 'scope-mismatch' }] });
    const currentScope = { ...scope };
    const result = compileActionReply(envelope(send()), catalog(), currentScope, ids());
    currentScope.turnId = 'later-turn';
    expect(result).toMatchObject({ ok: true, plan: { scope, operations: [{ scope }] } });
  });
});
