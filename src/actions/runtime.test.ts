import { describe, expect, it, vi } from 'vitest';
import { prepareActionExecution } from './runtime';
import type { ActionCatalog, ActionScope } from './contracts';
import type { ActionAdapters } from './executionRegistry';

const scope: ActionScope = { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' };
function fixture() {
  const catalog: ActionCatalog = { scope: { ...scope }, entries: [
    { handle: 'alice', id: 'a', kind: 'character', state: 'available', saveId: 'save', branchId: 'branch', capabilities: ['whatsup.send', 'image.generate'] },
    { handle: 'bob', id: 'b', kind: 'character', state: 'available', saveId: 'save', branchId: 'branch', capabilities: ['whatsup.receive'] },
  ] };
  const generateImage = vi.fn<ActionAdapters['generateImage']>(async () => {
    catalog.entries.push({ handle: 'image', id: 'asset', kind: 'image', state: 'available', saveId: 'save', branchId: 'branch', accessibleTo: ['a'] });
    return { artifactId: 'asset', ownerId: 'a' };
  });
  const sendMessage = vi.fn<ActionAdapters['sendMessage']>(async (request) => ({
    messageId: 10, fromId: request.fromId, toId: request.toId, text: request.text,
    ...(request.artifactId ? { artifactId: request.artifactId } : {}),
  }));
  const postSocial = vi.fn<ActionAdapters['postSocial']>(async (request) => ({
    postId: 'post-1', authorId: request.authorId, app: request.app,
  }));
  const commentOnSocial = vi.fn<ActionAdapters['commentOnSocial']>(async (request) => ({
    postId: request.postId, authorId: request.authorId, app: request.app, text: request.text,
  }));
  const transferFunds = vi.fn<ActionAdapters['transferFunds']>(async (request) => ({
    fromId: request.fromId, toId: request.toId, amount: request.amount,
  }));
  const writeNote = vi.fn<ActionAdapters['writeNote']>(async (request) => ({
    noteId: request.noteId ?? 'new-note', ownerId: request.ownerId,
  }));
  const simulateAssistantChat = vi.fn<ActionAdapters['simulateAssistantChat']>(async (request) => ({
    chatId: 'new-chat', ownerId: request.ownerId,
  }));
  let id = 0;
  const options = { scope, getCatalog: () => structuredClone(catalog), allocateId: () => `id-${++id}`,
    adapters: { generateImage, sendMessage, postSocial, commentOnSocial, transferFunds, writeNote, simulateAssistantChat } };
  const intent = { type: 'messenger.send', app: 'whatsup', from: 'alice', to: 'bob', text: 'Look', attachment: { type: 'generate_image', owner: 'alice', description: 'A sunset' } };
  const input = { version: 1, catalogId: scope.catalogId, blocks: [{ type: 'action', intent }] };
  return { catalog, generateImage, sendMessage, postSocial, commentOnSocial, transferFunds, writeNote, simulateAssistantChat, options, input };
}

describe('isolated action execution boundary', () => {
  it('binds the real generated artifact and executes once across concurrent run calls', async () => {
    const f = fixture();
    const prepared = prepareActionExecution(f.input, f.options);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const [first, second] = await Promise.all([prepared.execution.run(), prepared.execution.run()]);
    expect(first).toEqual(second);
    expect(first.operations.map((operation) => operation.status)).toEqual(['committed', 'committed']);
    expect(f.generateImage).toHaveBeenCalledTimes(1);
    expect(f.sendMessage).toHaveBeenCalledTimes(1);
    expect(f.sendMessage.mock.calls[0][0]).toMatchObject({ fromId: 'a', toId: 'b', text: 'Look', artifactId: 'asset', scope });
    expect(first.operations[1].result).toMatchObject({ type: 'messenger.sent', messageId: 10, artifactId: 'asset' });
    expect(first.blocks[0]).toMatchObject({ type: 'action', operationId: first.operations[1].id });
  });

  it('never executes a partially invalid reply', () => {
    const f = fixture();
    f.input.blocks.push({ type: 'action', intent: { ...f.input.blocks[0].intent, to: 'missing' } });
    expect(prepareActionExecution(f.input, f.options).ok).toBe(false);
    expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.sendMessage).not.toHaveBeenCalled();
  });

  it('checks destination availability again after generation, keeping the generated artifact', async () => {
    const f = fixture();
    const original = f.generateImage.getMockImplementation()!;
    f.generateImage.mockImplementation(async (request) => {
      const result = await original(request);
      f.catalog.entries[1].state = 'unavailable';
      return result;
    });
    const prepared = prepareActionExecution(f.input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const result = await prepared.execution.run();
    expect(result.operations.map((operation) => operation.status)).toEqual(['committed', 'failed']);
    expect(f.sendMessage).not.toHaveBeenCalled();
    expect(f.catalog.entries.some((entry) => entry.id === 'asset')).toBe(true);
  });

  it('checks the whole remaining plan before spending on generation after preparation', async () => {
    const f = fixture();
    const prepared = prepareActionExecution(f.input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    f.catalog.entries[1].state = 'unavailable';
    const result = await prepared.execution.run();
    expect(result.operations[0].status).toBe('failed');
    expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.sendMessage).not.toHaveBeenCalled();
  });

  it('treats unacknowledged adapter failures as uncertain and never auto-retries them', async () => {
    const f = fixture();
    f.sendMessage.mockRejectedValue(new Error('lost acknowledgement'));
    const prepared = prepareActionExecution(f.input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const first = await prepared.execution.run();
    expect(first.operations.map((operation) => operation.status)).toEqual(['committed', 'outcome-unknown']);
    await prepared.execution.run();
    expect(f.generateImage).toHaveBeenCalledTimes(1);
    expect(f.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('preflights accepted stable IDs even if current catalog handles have been reassigned', async () => {
    const f = fixture();
    const prepared = prepareActionExecution(f.input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const bob = f.catalog.entries[1];
    bob.handle = 'old-bob';
    bob.state = 'unavailable';
    f.catalog.entries.push({ ...bob, handle: 'bob', id: 'different-person', state: 'available' });
    await prepared.execution.run();
    expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.sendMessage).not.toHaveBeenCalled();
  });

  it('prevents delivery after cancellation without discarding a completed generation receipt', async () => {
    const f = fixture();
    const abort = new AbortController();
    const original = f.generateImage.getMockImplementation()!;
    f.generateImage.mockImplementation(async (request) => {
      const result = await original(request);
      abort.abort();
      return result;
    });
    const prepared = prepareActionExecution(f.input, { ...f.options, signal: abort.signal });
    if (!prepared.ok) throw new Error('fixture did not compile');
    const result = await prepared.execution.run();
    expect(result.operations.map((operation) => operation.status)).toEqual(['committed', 'cancelled']);
    expect(f.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed or mismatched adapter results instead of claiming delivery', async () => {
    const f = fixture();
    f.sendMessage.mockResolvedValue({ messageId: 10, fromId: 'a', toId: 'wrong-person', text: 'Look', artifactId: 'asset' });
    const prepared = prepareActionExecution(f.input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const result = await prepared.execution.run();
    expect(result.operations[1]).toMatchObject({ status: 'outcome-unknown' });
    expect(result.operations[1]).not.toHaveProperty('result');
  });

  it('rejects an unregistered generated artifact and blocks its delivery', async () => {
    const f = fixture();
    f.generateImage.mockResolvedValue({ artifactId: 'invented', ownerId: 'a' });
    const prepared = prepareActionExecution(f.input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const result = await prepared.execution.run();
    expect(result.operations.map((operation) => operation.status)).toEqual(['outcome-unknown', 'blocked']);
    expect(f.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps intentional identical sends separate and ignores mutations of the exposed plan', async () => {
    const f = fixture();
    const { attachment: _attachment, ...message } = f.input.blocks[0].intent;
    const input = { ...f.input, blocks: [{ type: 'action', intent: message }, { type: 'action', intent: message }] };
    let nextMessage = 10;
    f.sendMessage.mockImplementation(async (request) => ({ messageId: nextMessage++, fromId: request.fromId, toId: request.toId, text: request.text }));
    const prepared = prepareActionExecution(input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const exposed = prepared.execution.plan.operations[0].action;
    if (exposed.type === 'messenger.send') exposed.toId = 'wrong';
    const result = await prepared.execution.run();
    expect(f.generateImage).not.toHaveBeenCalled();
    expect(f.sendMessage).toHaveBeenCalledTimes(2);
    expect(result.operations.map((operation) => operation.result)).toMatchObject([
      { messageId: 10, toId: 'b' }, { messageId: 11, toId: 'b' },
    ]);
    result.operations.length = 0;
    expect((await prepared.execution.run()).operations).toHaveLength(2);
  });

  it('delivers a stored artifact without invoking generation', async () => {
    const f = fixture();
    f.catalog.entries.push({ handle: 'existing', id: 'stored', kind: 'image', state: 'available', saveId: 'save', branchId: 'branch', accessibleTo: ['a'] });
    const input = { ...f.input, blocks: [{ type: 'action', intent: { ...f.input.blocks[0].intent, attachment: { type: 'stored_image', ref: 'existing' } } }] };
    const prepared = prepareActionExecution(input, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    const result = await prepared.execution.run();
    expect(result.operations[0]).toMatchObject({ status: 'committed', result: { artifactId: 'stored' } });
    expect(f.generateImage).not.toHaveBeenCalled();
  });

  it('surfaces a scope change even for a reply containing no operations', async () => {
    const f = fixture();
    const prepared = prepareActionExecution({ version: 1, catalogId: scope.catalogId, blocks: [] }, f.options);
    if (!prepared.ok) throw new Error('fixture did not compile');
    f.catalog.scope.branchId = 'other';
    expect(await prepared.execution.run()).toMatchObject({ error: 'Action scope changed before execution.', operations: [] });
  });

  describe('H7 effect journal', () => {
    function journalFixture() {
      const f = fixture();
      const calls: string[] = [];
      const recordAttempt = vi.fn(async (input: { operationId: string; actionType: string }) => {
        calls.push(`attempt:${input.actionType}`);
      });
      const recordOutcome = vi.fn(async (input: { status: string }) => {
        calls.push(`outcome:${input.status}`);
      });
      return { ...f, calls, recordAttempt, recordOutcome, options: { ...f.options, journal: { recordAttempt, recordOutcome } } };
    }

    it('records a durable attempt before each real effect and its outcome immediately after, per operation', async () => {
      const f = journalFixture();
      const prepared = prepareActionExecution(f.input, f.options);
      if (!prepared.ok) throw new Error('fixture did not compile');
      await prepared.execution.run();
      expect(f.calls).toEqual(['attempt:image.generate', 'outcome:committed', 'attempt:messenger.send', 'outcome:committed']);
      expect(f.recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ scope, actionType: 'image.generate' }));
    });

    it('a rejected attempt write blocks the real effect entirely (fail closed)', async () => {
      const f = journalFixture();
      f.recordAttempt.mockRejectedValueOnce(new Error('disk full'));
      const prepared = prepareActionExecution(f.input, f.options);
      if (!prepared.ok) throw new Error('fixture did not compile');
      const result = await prepared.execution.run();
      expect(result.operations[0]).toMatchObject({ status: 'failed', error: 'disk full' });
      expect(f.generateImage).not.toHaveBeenCalled();
      expect(f.sendMessage).not.toHaveBeenCalled();
      expect(f.recordOutcome).not.toHaveBeenCalled();
    });

    it('still records a failed outcome when the real effect throws after the attempt was journaled', async () => {
      const f = journalFixture();
      f.sendMessage.mockRejectedValue(new Error('lost acknowledgement'));
      const prepared = prepareActionExecution(f.input, f.options);
      if (!prepared.ok) throw new Error('fixture did not compile');
      const result = await prepared.execution.run();
      expect(result.operations[1]).toMatchObject({ status: 'outcome-unknown' });
      expect(f.calls).toEqual(['attempt:image.generate', 'outcome:committed', 'attempt:messenger.send', 'outcome:failed']);
    });

    it('a failing outcome write never masks the original effect error reported to the caller', async () => {
      const f = journalFixture();
      f.sendMessage.mockRejectedValue(new Error('lost acknowledgement'));
      // The first outcome write (image.generate committing) succeeds; the second
      // (messenger.send failing) itself fails to write — that must not surface instead.
      let outcomeCalls = 0;
      f.recordOutcome.mockImplementation(async () => {
        outcomeCalls += 1;
        if (outcomeCalls === 2) throw new Error('journal write failed');
      });
      const prepared = prepareActionExecution(f.input, f.options);
      if (!prepared.ok) throw new Error('fixture did not compile');
      const result = await prepared.execution.run();
      expect(result.operations[1]).toMatchObject({ status: 'outcome-unknown', error: 'lost acknowledgement' });
    });

    it('runs unaffected with no journal supplied at all', async () => {
      const f = fixture();
      const prepared = prepareActionExecution(f.input, f.options);
      if (!prepared.ok) throw new Error('fixture did not compile');
      const result = await prepared.execution.run();
      expect(result.operations.map((operation) => operation.status)).toEqual(['committed', 'committed']);
    });
  });
});
