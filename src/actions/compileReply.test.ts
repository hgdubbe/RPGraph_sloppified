import { describe, expect, it, vi } from 'vitest';
import { compileActionReply } from './compileReply';
import type { ActionCatalog, ActionScope } from './contracts';

const scope: ActionScope = { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog-1' };
function catalog(): ActionCatalog {
  return {
    scope: { ...scope },
    entries: [
      { handle: 'person_1', id: 'alice-id', kind: 'character', state: 'available', saveId: 'save', branchId: 'branch', capabilities: ['whatsup.send', 'image.generate', 'fotogram.social'], bankBalance: 100 },
      { handle: 'person_2', id: 'bob-id', kind: 'character', state: 'available', saveId: 'save', branchId: 'branch', capabilities: ['whatsup.receive'] },
      { handle: 'image_1', id: 'image-id', kind: 'image', state: 'available', saveId: 'save', branchId: 'branch', accessibleTo: ['alice-id'] },
    ],
  };
}
const send = () => ({ type: 'messenger.send', app: 'whatsup', from: 'person_1', to: 'person_2', text: 'Look!' });
const post = () => ({ type: 'social.post', app: 'fotogram', author: 'person_1', caption: 'Look at this!' });
const comment = () => ({ type: 'social.comment', app: 'fotogram', author: 'person_1', postId: 'fotogram-post-01', text: 'Nice!' });
const transfer = () => ({ type: 'bank.transfer', from: 'person_1', to: 'person_2', amount: 25, note: 'For the cab.' });
const note = () => ({ type: 'note.write', owner: 'person_1', title: 'Reminder', body: 'Buy milk.' });
const chat = () => ({ type: 'assistant.chat', owner: 'person_1', messages: [
  { role: 'user', text: 'What should I say to Bob?' },
  { role: 'assistant', text: 'Try being honest with him.' },
] });
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

  it('supports an optional voice-message flag on messenger.send, dropping it when false', () => {
    const voice = compileActionReply(envelope({ ...send(), isVoiceMessage: true }), catalog(), scope, ids());
    expect(voice).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'messenger.send', isVoiceMessage: true } }] } });
    const notVoice = compileActionReply(envelope({ ...send(), isVoiceMessage: false }), catalog(), scope, ids());
    expect(notVoice.ok).toBe(true);
    if (!notVoice.ok) return;
    expect(notVoice.plan.operations[0].action).not.toHaveProperty('isVoiceMessage');
    expect(compileActionReply(envelope({ ...send(), isVoiceMessage: 'yes' }), catalog(), scope, ids()))
      .toMatchObject({ ok: false, issues: [{ path: 'blocks[0].intent.isVoiceMessage', code: 'invalid-shape' }] });
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

  it('accepts a social post/comment from a character with a configured account', () => {
    const postResult = compileActionReply(envelope(post()), catalog(), scope, ids());
    expect(postResult).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'social.post', app: 'fotogram', authorId: 'alice-id', caption: 'Look at this!' } }] } });
    const commentResult = compileActionReply(envelope(comment()), catalog(), scope, ids());
    expect(commentResult).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'social.comment', app: 'fotogram', authorId: 'alice-id', postId: 'fotogram-post-01', text: 'Nice!' } }] } });
  });

  it.each([
    ['unknown app', { ...post(), app: 'myspace' }, 'invalid-shape'],
    ['unknown author', { ...post(), author: 'Alice' }, 'unknown-reference'],
    ['wrong reference type', { ...post(), author: 'image_1' }, 'wrong-reference-type'],
    ['author without a configured account', { ...post(), author: 'person_2' }, 'unsupported-capability'],
    ['empty caption', { ...post(), caption: '  ' }, 'invalid-shape'],
  ])('rejects a social post with %s', (_label, intent, code) => {
    expect(compileActionReply(envelope(intent), catalog(), scope, ids())).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
  });

  it.each([
    ['unknown app', { ...comment(), app: 'myspace' }, 'invalid-shape'],
    ['author without a configured account', { ...comment(), author: 'person_2' }, 'unsupported-capability'],
    ['empty text', { ...comment(), text: '  ' }, 'invalid-shape'],
  ])('rejects a social comment with %s', (_label, intent, code) => {
    expect(compileActionReply(envelope(intent), catalog(), scope, ids())).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
  });

  it('accepts a bank transfer between two known characters, model-authored or not', () => {
    const result = compileActionReply(envelope(transfer()), catalog(), scope, ids());
    expect(result).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'bank.transfer', fromId: 'alice-id', toId: 'bob-id', amount: 25, note: 'For the cab.' } }] } });
  });

  it('drops a blank transfer note rather than storing an empty string', () => {
    const result = compileActionReply(envelope({ ...transfer(), note: '  ' }), catalog(), scope, ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.operations[0].action).not.toHaveProperty('note');
  });

  it.each([
    ['unknown recipient', { ...transfer(), to: 'Bob' }, 'unknown-reference'],
    ['same account', { ...transfer(), to: 'person_1' }, 'invalid-destination'],
    ['zero amount', { ...transfer(), amount: 0 }, 'invalid-shape'],
    ['negative amount', { ...transfer(), amount: -5 }, 'invalid-shape'],
    ['amount over the cap', { ...transfer(), amount: 2_000_000 }, 'invalid-shape'],
    ['insufficient balance', { ...transfer(), amount: 1000 }, 'unsupported-capability'],
    ['extra field', { ...transfer(), extra: true }, 'invalid-shape'],
  ])('rejects a bank transfer with %s', (_label, intent, code) => {
    const allocate = ids();
    expect(compileActionReply(envelope(intent), catalog(), scope, allocate)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect(allocate).not.toHaveBeenCalled();
  });

  it('accepts a note write for a known character, creating a new note by default', () => {
    const result = compileActionReply(envelope(note()), catalog(), scope, ids());
    expect(result).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'note.write', ownerId: 'alice-id', title: 'Reminder', body: 'Buy milk.' } }] } });
    if (!result.ok) return;
    expect(result.plan.operations[0].action).not.toHaveProperty('noteId');
  });

  it('accepts a note write with an explicit noteId to update an existing note', () => {
    const result = compileActionReply(envelope({ ...note(), noteId: 'note-123' }), catalog(), scope, ids());
    expect(result).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'note.write', ownerId: 'alice-id', noteId: 'note-123' } }] } });
  });

  it.each([
    ['unknown owner', { ...note(), owner: 'Alice' }, 'unknown-reference'],
    ['empty title', { ...note(), title: '  ' }, 'invalid-shape'],
    ['empty body', { ...note(), body: '' }, 'invalid-shape'],
    ['extra field', { ...note(), extra: true }, 'invalid-shape'],
  ])('rejects a note write with %s', (_label, intent, code) => {
    const allocate = ids();
    expect(compileActionReply(envelope(intent), catalog(), scope, allocate)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect(allocate).not.toHaveBeenCalled();
  });

  it('accepts a one-exchange assistant chat for a known character', () => {
    const result = compileActionReply(envelope(chat()), catalog(), scope, ids());
    expect(result).toMatchObject({ ok: true, plan: { operations: [{ action: { type: 'assistant.chat', ownerId: 'alice-id', messages: chat().messages } }] } });
  });

  it('accepts up to four alternating exchanges', () => {
    const fourExchanges = { ...chat(), messages: Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant', text: `Message ${index}`,
    })) };
    expect(compileActionReply(envelope(fourExchanges), catalog(), scope, ids())).toMatchObject({ ok: true });
  });

  it.each([
    ['unknown owner', { ...chat(), owner: 'Alice' }, 'unknown-reference'],
    ['single message', { ...chat(), messages: [chat().messages[0]] }, 'invalid-shape'],
    ['odd message count', { ...chat(), messages: [...chat().messages, { role: 'user', text: 'Anything else?' }] }, 'invalid-shape'],
    ['too many exchanges', { ...chat(), messages: Array.from({ length: 10 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: `m${i}` })) }, 'invalid-shape'],
    ['starts with assistant', { ...chat(), messages: [{ role: 'assistant', text: 'Hi there.' }, { role: 'user', text: 'Hi.' }] }, 'invalid-shape'],
    ['two user messages in a row', { ...chat(), messages: [{ role: 'user', text: 'One?' }, { role: 'user', text: 'Two?' }] }, 'invalid-shape'],
    ['blank message text', { ...chat(), messages: [{ role: 'user', text: '  ' }, { role: 'assistant', text: 'Reply.' }] }, 'invalid-shape'],
    ['extra field', { ...chat(), extra: true }, 'invalid-shape'],
  ])('rejects an assistant chat with %s', (_label, intent, code) => {
    const allocate = ids();
    expect(compileActionReply(envelope(intent), catalog(), scope, allocate)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect(allocate).not.toHaveBeenCalled();
  });
});
