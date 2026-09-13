import { describe, expect, it, vi } from 'vitest';
import { createStagedActionAdapter, type StagedActionBridge } from './stagedActionAdapter';
import type { ActionCatalog } from '../actions/contracts';
import type { ExecutionReport } from '../actions/runtime';
import type { StageExecutionInput } from './scheduler';
import type { TurnScope, VariableRecord } from './contracts';

const scope: TurnScope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
const catalog: ActionCatalog = {
  scope: { ...scope, catalogId: 'catalog-1' },
  entries: [
    {
      id: 'alice',
      handle: 'person_1',
      kind: 'character',
      saveId: 'save',
      branchId: 'branch',
      state: 'available',
      capabilities: ['whatsup.send', 'image.generate'],
      allowedRecipientIds: ['bob'],
    },
    {
      id: 'bob',
      handle: 'person_2',
      kind: 'character',
      saveId: 'save',
      branchId: 'branch',
      state: 'available',
      capabilities: ['whatsup.receive'],
    },
    {
      id: 'artifact-1',
      handle: 'image_1',
      kind: 'image',
      saveId: 'save',
      branchId: 'branch',
      state: 'available',
      accessibleTo: ['alice'],
    },
  ],
};

function textRecord(text: string): VariableRecord {
  return {
    ref: { id: 'draft', revision: 1, kind: 'text', scope },
    scope,
    value: { kind: 'text', text },
    producer: { kind: 'stage', stageId: 'draft-stage' },
    inputs: [],
    provenance: 'generated',
    visibility: { kind: 'characters', characterIds: ['alice'] },
    retention: 'draft',
  };
}

function artifactRecord(): VariableRecord {
  return {
    ref: { id: 'artifact', revision: 1, kind: 'artifact', scope },
    scope,
    value: { kind: 'artifact', artifactId: 'artifact-1', mediaType: 'image' },
    producer: { kind: 'stage', stageId: 'image-stage' },
    inputs: [],
    provenance: 'generated',
    visibility: { kind: 'characters', characterIds: ['alice'] },
    retention: 'draft',
  };
}

function messagesRecord(): VariableRecord {
  return {
    ref: { id: 'messages', revision: 1, kind: 'messages', scope },
    scope,
    value: { kind: 'messages', messages: [{ role: 'user', text: 'Hi there' }, { role: 'assistant', text: 'Hello!' }] },
    producer: { kind: 'stage', stageId: 'messages-stage' },
    inputs: [],
    provenance: 'generated',
    visibility: { kind: 'characters', characterIds: ['alice'] },
    retention: 'draft',
  };
}

type RecipeId = 'image.generate' | 'whatsup.message-with-artifact' | 'note.write' | 'bank.transfer' | 'assistant.chat';

const lockedArgumentsByRecipe: Record<RecipeId, Record<string, string | number | boolean>> = {
  'image.generate': { ownerId: 'alice' },
  'whatsup.message-with-artifact': { recipientId: 'bob' },
  'note.write': { ownerId: 'alice' },
  'bank.transfer': { fromId: 'alice', toId: 'bob', amount: 25 },
  'assistant.chat': { ownerId: 'alice' },
};

function input(
  recipeId: RecipeId,
  key: 'artifact' | 'receipt',
  inputs: VariableRecord[],
): StageExecutionInput {
  return {
    stage: {
      id: `${recipeId}/${key}`,
      instanceId: 'instance-1',
      recipeId,
      key,
      kind: 'execute-action',
      actorId: 'alice',
      visibility: { kind: 'characters', characterIds: ['alice'] },
      lockedArguments: lockedArgumentsByRecipe[recipeId],
      retryPolicy: 'reconcile-before-retry',
      inputs: [],
      output: { id: `${recipeId}/${key}/output`, kind: recipeId === 'image.generate' ? 'artifact' : 'receipt' },
      dependencies: [],
    },
    inputs,
  };
}

function bridge(result: ExecutionReport): StagedActionBridge & {
  execute: ReturnType<typeof vi.fn<StagedActionBridge['execute']>>;
} {
  return {
    getCatalog: () => structuredClone(catalog),
    execute: vi.fn(async (_input: unknown) => structuredClone(result)),
  };
}

describe('staged action adapter', () => {
  it('runs image generation through the shared action bridge and returns an artifact variable', async () => {
    const fake = bridge({
      scope: catalog.scope,
      blocks: [{ type: 'action', id: 'block-1', operationId: 'operation-1' }],
      operations: [{
        id: 'operation-1',
        status: 'committed',
        result: { type: 'image.generated', artifactId: 'artifact-1', ownerId: 'alice' },
      }],
    });
    const adapter = createStagedActionAdapter(fake);
    await expect(adapter(input('image.generate', 'artifact', [textRecord('A red coat by a rainy window.')]))).resolves.toEqual({
      kind: 'artifact',
      artifactId: 'artifact-1',
      mediaType: 'image',
    });
    expect(fake.execute).toHaveBeenCalledWith({
      version: 1,
      catalogId: 'catalog-1',
      blocks: [{
        type: 'action',
        intent: {
          type: 'image.generate',
          owner: 'person_1',
          description: 'A red coat by a rainy window.',
        },
      }],
    });
  });

  it('runs WhatsUp delivery through the shared action bridge and returns a committed receipt variable', async () => {
    const fake = bridge({
      scope: catalog.scope,
      blocks: [{ type: 'action', id: 'block-1', operationId: 'operation-1' }],
      operations: [{
        id: 'operation-1',
        status: 'committed',
        result: { type: 'messenger.sent', messageId: 42, fromId: 'alice', toId: 'bob', text: 'Here it is.', artifactId: 'artifact-1' },
      }],
    });
    const adapter = createStagedActionAdapter(fake);
    await expect(adapter(input('whatsup.message-with-artifact', 'receipt', [textRecord('Here it is.'), artifactRecord()]))).resolves.toEqual({
      kind: 'receipt',
      operationId: 'operation-1',
      receiptId: 'message:42',
    });
    expect(fake.execute).toHaveBeenCalledWith({
      version: 1,
      catalogId: 'catalog-1',
      blocks: [{
        type: 'action',
        intent: {
          type: 'messenger.send',
          app: 'whatsup',
          from: 'person_1',
          to: 'person_2',
          text: 'Here it is.',
          attachment: { type: 'stored_image', ref: 'image_1' },
        },
      }],
    });
  });

  it('runs a note write through the shared action bridge with positional title/body inputs', async () => {
    const fake = bridge({
      scope: catalog.scope,
      blocks: [{ type: 'action', id: 'block-1', operationId: 'operation-1' }],
      operations: [{
        id: 'operation-1',
        status: 'committed',
        result: { type: 'note.written', noteId: 'note-1', ownerId: 'alice' },
      }],
    });
    const adapter = createStagedActionAdapter(fake);
    await expect(adapter(input('note.write', 'receipt', [textRecord('Reminder'), textRecord('Buy milk.')]))).resolves.toEqual({
      kind: 'receipt',
      operationId: 'operation-1',
      receiptId: 'note:note-1',
    });
    expect(fake.execute).toHaveBeenCalledWith({
      version: 1,
      catalogId: 'catalog-1',
      blocks: [{
        type: 'action',
        intent: { type: 'note.write', owner: 'person_1', title: 'Reminder', body: 'Buy milk.' },
      }],
    });
  });

  it('runs a bank transfer through the shared action bridge, dropping a blank note', async () => {
    const fake = bridge({
      scope: catalog.scope,
      blocks: [{ type: 'action', id: 'block-1', operationId: 'operation-1' }],
      operations: [{
        id: 'operation-1',
        status: 'committed',
        result: { type: 'bank.transferred', fromId: 'alice', toId: 'bob', amount: 25 },
      }],
    });
    const adapter = createStagedActionAdapter(fake);
    await expect(adapter(input('bank.transfer', 'receipt', [textRecord('   ')]))).resolves.toEqual({
      kind: 'receipt',
      operationId: 'operation-1',
      receiptId: 'bank:operation-1',
    });
    expect(fake.execute).toHaveBeenCalledWith({
      version: 1,
      catalogId: 'catalog-1',
      blocks: [{
        type: 'action',
        intent: { type: 'bank.transfer', from: 'person_1', to: 'person_2', amount: 25 },
      }],
    });
  });

  it('runs an assistant chat through the shared action bridge with the messages input', async () => {
    const fake = bridge({
      scope: catalog.scope,
      blocks: [{ type: 'action', id: 'block-1', operationId: 'operation-1' }],
      operations: [{
        id: 'operation-1',
        status: 'committed',
        result: { type: 'assistant.chatted', chatId: 'chat-1', ownerId: 'alice' },
      }],
    });
    const adapter = createStagedActionAdapter(fake);
    await expect(adapter(input('assistant.chat', 'receipt', [messagesRecord()]))).resolves.toEqual({
      kind: 'receipt',
      operationId: 'operation-1',
      receiptId: 'chat:chat-1',
    });
    expect(fake.execute).toHaveBeenCalledWith({
      version: 1,
      catalogId: 'catalog-1',
      blocks: [{
        type: 'action',
        intent: {
          type: 'assistant.chat',
          owner: 'person_1',
          messages: [{ role: 'user', text: 'Hi there' }, { role: 'assistant', text: 'Hello!' }],
        },
      }],
    });
  });

  it('does not claim success for uncommitted shared action reports', async () => {
    const fake = bridge({
      scope: catalog.scope,
      blocks: [{ type: 'action', id: 'block-1', operationId: 'operation-1' }],
      operations: [{ id: 'operation-1', status: 'outcome-unknown', error: 'lost acknowledgement' }],
    });
    await expect(createStagedActionAdapter(fake)(input('whatsup.message-with-artifact', 'receipt', [textRecord('Here it is.')]))).rejects.toThrow('lost acknowledgement');
  });
});
