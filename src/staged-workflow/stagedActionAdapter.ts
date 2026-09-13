import type { ActionCatalog } from '../actions/contracts';
import type { ExecutionReport } from '../actions/runtime';
import type { StageExecutionInput, StagedSchedulerAdapters } from './scheduler';
import type { VariableRecord, VariableValue } from './contracts';

export type StagedActionBridge = {
  getCatalog: () => ActionCatalog;
  execute: (input: unknown) => Promise<ExecutionReport>;
};

function catalogIdFor(catalog: ActionCatalog, id: string, kind: 'character' | 'image') {
  const entry = catalog.entries.find((candidate) => candidate.id === id && candidate.kind === kind);
  if (!entry) throw new Error(`Staged action reference is not in the current action catalog: ${id}.`);
  return entry.handle;
}

function textInput(inputs: VariableRecord[], label: string) {
  const record = inputs.find((input) => input.value.kind === 'text');
  if (record?.value.kind !== 'text') throw new Error(`Staged action is missing ${label} text.`);
  return record.value.text;
}

// For a step with more than one text input (unlike every other recipe here, which has
// at most one), the scheduler passes `inputs` positionally in the same order as the
// recipe step's own `inputs: [...]` declaration (see scheduler.ts's recordsFor) - so
// looking up by position is reliable, unlike textInput's kind-only search above.
function textInputAt(inputs: VariableRecord[], index: number, label: string) {
  const record = inputs[index];
  if (record?.value.kind !== 'text') throw new Error(`Staged action is missing ${label} text.`);
  return record.value.text;
}

function messagesInput(inputs: VariableRecord[]) {
  const record = inputs.find((input) => input.value.kind === 'messages');
  if (record?.value.kind !== 'messages') throw new Error('Staged action is missing chat messages.');
  return record.value.messages;
}

function artifactInput(inputs: VariableRecord[]) {
  const record = inputs.find((input) => input.value.kind === 'artifact');
  if (!record) return undefined;
  if (record.value.kind !== 'artifact' || record.value.mediaType !== 'image') {
    throw new Error('Staged WhatsUp delivery only supports image artifacts in this slice.');
  }
  return record.value.artifactId;
}

function committedOperation(report: ExecutionReport) {
  const operation = report.operations.find((candidate) => candidate.status === 'committed' && candidate.result);
  if (!operation?.result) throw new Error(report.error ?? report.operations[0]?.error ?? 'Staged action did not commit.');
  return operation.result;
}

export function createStagedActionAdapter(bridge: StagedActionBridge): StagedSchedulerAdapters['executeAction'] {
  return async ({ stage, inputs }: StageExecutionInput): Promise<VariableValue> => {
    const catalog = bridge.getCatalog();
    if ((stage.recipeId === 'image.generate' || stage.recipeId === 'whatsup.picture-message') && stage.key === 'artifact') {
      const owner = catalogIdFor(catalog, String(stage.lockedArguments.ownerId), 'character');
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{
          type: 'action',
          intent: { type: 'image.generate', owner, description: textInput(inputs, 'image prompt') },
        }],
      });
      const result = committedOperation(report);
      if (result.type !== 'image.generated') throw new Error('Staged image generation returned the wrong receipt type.');
      return { kind: 'artifact', artifactId: result.artifactId, mediaType: 'image' };
    }
    if ((stage.recipeId === 'whatsup.message' || stage.recipeId === 'whatsup.message-with-artifact' || stage.recipeId === 'voice.message' || stage.recipeId === 'whatsup.picture-message') && stage.key === 'receipt') {
      const from = catalogIdFor(catalog, stage.actorId, 'character');
      const to = catalogIdFor(catalog, String(stage.lockedArguments.recipientId), 'character');
      const artifactId = artifactInput(inputs);
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{
          type: 'action',
          intent: {
            type: 'messenger.send',
            app: 'whatsup',
            from,
            to,
            text: textInput(inputs, 'message draft'),
            ...(artifactId ? { attachment: { type: 'stored_image', ref: catalogIdFor(catalog, artifactId, 'image') } } : {}),
            ...(stage.recipeId === 'voice.message' ? { isVoiceMessage: true } : {}),
          },
        }],
      });
      const result = committedOperation(report);
      if (result.type !== 'messenger.sent') throw new Error('Staged WhatsUp delivery returned the wrong receipt type.');
      return { kind: 'receipt', operationId: report.operations[0].id, receiptId: `message:${result.messageId}` };
    }
    if (stage.recipeId === 'social.post' && stage.key === 'receipt') {
      const author = catalogIdFor(catalog, stage.actorId, 'character');
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{
          type: 'action',
          intent: { type: 'social.post', app: String(stage.lockedArguments.app), author, caption: textInput(inputs, 'post caption') },
        }],
      });
      const result = committedOperation(report);
      if (result.type !== 'social.posted') throw new Error('Staged social post returned the wrong receipt type.');
      return { kind: 'receipt', operationId: report.operations[0].id, receiptId: `social:${result.postId}` };
    }
    if (stage.recipeId === 'social.comment' && stage.key === 'receipt') {
      const author = catalogIdFor(catalog, stage.actorId, 'character');
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{
          type: 'action',
          intent: {
            type: 'social.comment', app: String(stage.lockedArguments.app), author,
            postId: String(stage.lockedArguments.postId), text: textInput(inputs, 'comment text'),
          },
        }],
      });
      const result = committedOperation(report);
      if (result.type !== 'social.commented') throw new Error('Staged social comment returned the wrong receipt type.');
      return { kind: 'receipt', operationId: report.operations[0].id, receiptId: `social:${result.postId}` };
    }
    if (stage.recipeId === 'note.write' && stage.key === 'receipt') {
      const owner = catalogIdFor(catalog, String(stage.lockedArguments.ownerId), 'character');
      const title = textInputAt(inputs, 0, 'note title');
      const body = textInputAt(inputs, 1, 'note body');
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{ type: 'action', intent: { type: 'note.write', owner, title, body } }],
      });
      const result = committedOperation(report);
      if (result.type !== 'note.written') throw new Error('Staged note write returned the wrong receipt type.');
      return { kind: 'receipt', operationId: report.operations[0].id, receiptId: `note:${result.noteId}` };
    }
    if (stage.recipeId === 'assistant.chat' && stage.key === 'receipt') {
      const owner = catalogIdFor(catalog, String(stage.lockedArguments.ownerId), 'character');
      const messages = messagesInput(inputs);
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{ type: 'action', intent: { type: 'assistant.chat', owner, messages } }],
      });
      const result = committedOperation(report);
      if (result.type !== 'assistant.chatted') throw new Error('Staged assistant chat returned the wrong receipt type.');
      return { kind: 'receipt', operationId: report.operations[0].id, receiptId: `chat:${result.chatId}` };
    }
    if (stage.recipeId === 'bank.transfer' && stage.key === 'receipt') {
      const from = catalogIdFor(catalog, String(stage.lockedArguments.fromId), 'character');
      const to = catalogIdFor(catalog, String(stage.lockedArguments.toId), 'character');
      const amount = Number(stage.lockedArguments.amount);
      const note = textInput(inputs, 'transfer note');
      const report = await bridge.execute({
        version: 1,
        catalogId: catalog.scope.catalogId,
        blocks: [{
          type: 'action',
          intent: { type: 'bank.transfer', from, to, amount, ...(note.trim() ? { note } : {}) },
        }],
      });
      const result = committedOperation(report);
      if (result.type !== 'bank.transferred') throw new Error('Staged bank transfer returned the wrong receipt type.');
      return { kind: 'receipt', operationId: report.operations[0].id, receiptId: `bank:${report.operations[0].id}` };
    }
    throw new Error(`No staged action adapter is registered for ${stage.recipeId}/${stage.key}.`);
  };
}
