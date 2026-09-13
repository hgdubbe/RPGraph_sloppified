import {
  socialCapability,
  type ActionCatalog, type ActionCatalogEntry, type ActionScope, type AssistantChatMessage, type CanonicalAction, type SocialApp, type ValidatedOperation,
} from './contracts';
import { actionDefinitions } from './schema';

type AdapterContext = { operationId: string; scope: ActionScope; signal?: AbortSignal };
export type ImageGenerationRequest = AdapterContext & { ownerId: string; description: string };
export type MessageDeliveryRequest = AdapterContext & {
  app: 'whatsup'; fromId: string; toId: string; text: string; artifactId?: string; isVoiceMessage?: boolean;
};
export type SocialPostRequest = AdapterContext & { app: SocialApp; authorId: string; caption: string };
export type SocialCommentRequest = AdapterContext & { app: SocialApp; authorId: string; postId: string; text: string };
export type BankTransferRequest = AdapterContext & { fromId: string; toId: string; amount: number; note?: string };
export type NoteWriteRequest = AdapterContext & { ownerId: string; title: string; body: string; noteId?: string };
export type AssistantChatRequest = AdapterContext & { ownerId: string; messages: AssistantChatMessage[] };

// Adapters must persist the asset/message/post before acknowledging it. The H7 effect
// journal (see runtime.ts) durably records the attempt, but reconciliation/retry is not
// implemented; adapter implementations must not imply automatic recovery either.
export type ActionAdapters = {
  generateImage: (request: ImageGenerationRequest) => Promise<unknown>;
  sendMessage: (request: MessageDeliveryRequest) => Promise<unknown>;
  postSocial: (request: SocialPostRequest) => Promise<unknown>;
  commentOnSocial: (request: SocialCommentRequest) => Promise<unknown>;
  transferFunds: (request: BankTransferRequest) => Promise<unknown>;
  writeNote: (request: NoteWriteRequest) => Promise<unknown>;
  simulateAssistantChat: (request: AssistantChatRequest) => Promise<unknown>;
};

export type ActionResult =
  | { type: 'image.generated'; artifactId: string; ownerId: string }
  | { type: 'messenger.sent'; messageId: number; fromId: string; toId: string; text: string; artifactId?: string; isVoiceMessage?: boolean }
  | { type: 'social.posted'; postId: string; authorId: string; app: SocialApp }
  | { type: 'social.commented'; postId: string; authorId: string; app: SocialApp; text: string }
  | { type: 'bank.transferred'; fromId: string; toId: string; amount: number }
  | { type: 'note.written'; noteId: string; ownerId: string }
  | { type: 'assistant.chatted'; chatId: string; ownerId: string };

type ExecutionContext = {
  adapters: ActionAdapters;
  signal?: AbortSignal;
  artifactId?: string;
  getCatalog: () => ActionCatalog;
};

type ExecutionDefinition = {
  key: CanonicalAction['type'];
  retryPolicy: 'reconcile-before-retry';
  execute: (operation: ValidatedOperation, context: ExecutionContext) => Promise<ActionResult>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Adapter returned an invalid result object.');
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new Error('Adapter returned unexpected result fields.');
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Adapter returned an invalid artifact ID.');
  return value;
}

export function assertCatalogScope(catalog: ActionCatalog, scope: ActionScope) {
  for (const key of ['saveId', 'branchId', 'turnId', 'catalogId'] as const) {
    if (catalog.scope[key] !== scope[key]) throw new Error('Action scope changed before execution.');
  }
}

function currentReference<K extends ActionCatalogEntry['kind']>(catalog: ActionCatalog, scope: ActionScope, id: string, kind: K): Extract<ActionCatalogEntry, { kind: K }> {
  const matches = catalog.entries.filter((entry) => entry.id === id && entry.kind === kind);
  if (matches.length !== 1) throw new Error(`Missing or ambiguous ${kind} reference: ${id}.`);
  const entry = matches[0];
  if (entry.saveId !== scope.saveId || entry.branchId !== scope.branchId || entry.state !== 'available') {
    throw new Error(`Unavailable or cross-scope reference: ${id}.`);
  }
  return entry as Extract<ActionCatalogEntry, { kind: K }>;
}

function assertImageAccess(catalog: ActionCatalog, scope: ActionScope, artifactId: string, characterId: string) {
  const image = currentReference(catalog, scope, artifactId, 'image');
  if (!image.accessibleTo.includes(characterId)) throw new Error('The acting character cannot access the image.');
}

export function assertOperationAvailable(operation: ValidatedOperation, catalog: ActionCatalog, artifactId?: string, allowPendingGeneration = false) {
  assertCatalogScope(catalog, operation.scope);
  const action = operation.action;
  if (action.type === 'image.generate') {
    const owner = currentReference(catalog, operation.scope, action.ownerId, 'character');
    if (!owner.capabilities.includes('image.generate')) throw new Error('Image generation is no longer available.');
    return;
  }
  if (action.type === 'social.post' || action.type === 'social.comment') {
    const author = currentReference(catalog, operation.scope, action.authorId, 'character');
    if (!author.capabilities.includes(socialCapability(action.app))) {
      throw new Error('This character no longer has a configured account on that app.');
    }
    return;
  }
  if (action.type === 'bank.transfer') {
    const from = currentReference(catalog, operation.scope, action.fromId, 'character');
    const to = currentReference(catalog, operation.scope, action.toId, 'character');
    if (from.id === to.id) throw new Error('Sender and recipient must be different characters.');
    // Re-checked here against the live catalog (not just at compile time) since the
    // balance can change between compiling the plan and actually executing it.
    if (typeof from.bankBalance === 'number' && action.amount > from.bankBalance) {
      throw new Error('The sender no longer has enough balance for this transfer.');
    }
    return;
  }
  if (action.type === 'note.write' || action.type === 'assistant.chat') {
    currentReference(catalog, operation.scope, action.ownerId, 'character');
    return;
  }
  const from = currentReference(catalog, operation.scope, action.fromId, 'character');
  const to = currentReference(catalog, operation.scope, action.toId, 'character');
  if (from.allowedRecipientIds && !from.allowedRecipientIds.includes(to.id)) throw new Error('This phone contact is blocked.');
  if (from.id === to.id || !from.capabilities.includes('whatsup.send') || !to.capabilities.includes('whatsup.receive')) {
    throw new Error('The requested WhatsUp delivery is no longer available.');
  }
  if (action.attachment && !artifactId && !(allowPendingGeneration && action.attachment.type === 'operation-result')) {
    throw new Error('Delivery is missing its required image artifact.');
  }
  if (artifactId) assertImageAccess(catalog, operation.scope, artifactId, from.id);
}

const generation: ExecutionDefinition = {
  key: 'image.generate',
  retryPolicy: actionDefinitions['image.generate'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'image.generate') throw new Error('Wrong action passed to image handler.');
    const { ownerId, description } = operation.action;
    const result = record(await context.adapters.generateImage({
      operationId: operation.id, scope: { ...operation.scope }, ownerId, description, signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['image.generate'].resultSchema.properties));
    const artifactId = identifier(result.artifactId);
    if (result.ownerId !== ownerId) throw new Error('Generated artifact owner does not match the requested owner.');
    const catalog = context.getCatalog();
    assertCatalogScope(catalog, operation.scope);
    assertImageAccess(catalog, operation.scope, artifactId, ownerId);
    return { type: 'image.generated', artifactId, ownerId };
  },
};

const messenger: ExecutionDefinition = {
  key: 'messenger.send',
  retryPolicy: actionDefinitions['messenger.send'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'messenger.send') throw new Error('Wrong action passed to messenger handler.');
    const { app, fromId, toId, text, isVoiceMessage } = operation.action;
    const result = record(await context.adapters.sendMessage({
      operationId: operation.id, scope: { ...operation.scope }, app, fromId, toId, text,
      ...(context.artifactId ? { artifactId: context.artifactId } : {}),
      ...(isVoiceMessage ? { isVoiceMessage: true } : {}), signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['messenger.send'].resultSchema.properties));
    if (typeof result.messageId !== 'number' || !Number.isSafeInteger(result.messageId) || result.messageId < 0
      || result.fromId !== fromId || result.toId !== toId || result.text !== text || result.artifactId !== context.artifactId) {
      throw new Error('Delivery acknowledgement does not match the requested message.');
    }
    return { type: 'messenger.sent', messageId: result.messageId, fromId, toId, text,
      ...(context.artifactId ? { artifactId: context.artifactId } : {}),
      ...(isVoiceMessage ? { isVoiceMessage: true } : {}),
    };
  },
};

const socialPost: ExecutionDefinition = {
  key: 'social.post',
  retryPolicy: actionDefinitions['social.post'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'social.post') throw new Error('Wrong action passed to social post handler.');
    const { app, authorId, caption } = operation.action;
    const result = record(await context.adapters.postSocial({
      operationId: operation.id, scope: { ...operation.scope }, app, authorId, caption, signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['social.post'].resultSchema.properties));
    if (result.app !== app || result.authorId !== authorId) {
      throw new Error('Post acknowledgement does not match the requested author or app.');
    }
    return { type: 'social.posted', postId: identifier(result.postId), authorId, app };
  },
};

const socialComment: ExecutionDefinition = {
  key: 'social.comment',
  retryPolicy: actionDefinitions['social.comment'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'social.comment') throw new Error('Wrong action passed to social comment handler.');
    const { app, authorId, postId, text } = operation.action;
    const result = record(await context.adapters.commentOnSocial({
      operationId: operation.id, scope: { ...operation.scope }, app, authorId, postId, text, signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['social.comment'].resultSchema.properties));
    if (result.app !== app || result.authorId !== authorId || result.postId !== postId || result.text !== text) {
      throw new Error('Comment acknowledgement does not match the requested post, author or text.');
    }
    return { type: 'social.commented', postId, authorId, app, text };
  },
};

const bankTransfer: ExecutionDefinition = {
  key: 'bank.transfer',
  retryPolicy: actionDefinitions['bank.transfer'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'bank.transfer') throw new Error('Wrong action passed to bank transfer handler.');
    const { fromId, toId, amount, note } = operation.action;
    const result = record(await context.adapters.transferFunds({
      operationId: operation.id, scope: { ...operation.scope }, fromId, toId, amount, ...(note ? { note } : {}), signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['bank.transfer'].resultSchema.properties));
    if (result.fromId !== fromId || result.toId !== toId || result.amount !== amount) {
      throw new Error('Transfer acknowledgement does not match the requested parties or amount.');
    }
    return { type: 'bank.transferred', fromId, toId, amount };
  },
};

const noteWrite: ExecutionDefinition = {
  key: 'note.write',
  retryPolicy: actionDefinitions['note.write'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'note.write') throw new Error('Wrong action passed to note write handler.');
    const { ownerId, title, body, noteId } = operation.action;
    const result = record(await context.adapters.writeNote({
      operationId: operation.id, scope: { ...operation.scope }, ownerId, title, body, ...(noteId ? { noteId } : {}), signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['note.write'].resultSchema.properties));
    if (result.ownerId !== ownerId || typeof result.noteId !== 'string' || !result.noteId.trim()) {
      throw new Error('Note acknowledgement does not match the requested owner or is missing a note ID.');
    }
    return { type: 'note.written', noteId: result.noteId, ownerId };
  },
};

const assistantChat: ExecutionDefinition = {
  key: 'assistant.chat',
  retryPolicy: actionDefinitions['assistant.chat'].retryPolicy,
  async execute(operation, context) {
    if (operation.action.type !== 'assistant.chat') throw new Error('Wrong action passed to assistant chat handler.');
    const { ownerId, messages } = operation.action;
    const result = record(await context.adapters.simulateAssistantChat({
      operationId: operation.id, scope: { ...operation.scope }, ownerId, messages, signal: context.signal,
    }));
    exactFields(result, Object.keys(actionDefinitions['assistant.chat'].resultSchema.properties));
    if (result.ownerId !== ownerId || typeof result.chatId !== 'string' || !result.chatId.trim()) {
      throw new Error('Assistant chat acknowledgement does not match the requested owner or is missing a chat ID.');
    }
    return { type: 'assistant.chatted', chatId: result.chatId, ownerId };
  },
};

const registry = new Map<CanonicalAction['type'], ExecutionDefinition>([
  [generation.key, generation], [messenger.key, messenger], [socialPost.key, socialPost], [socialComment.key, socialComment],
  [bankTransfer.key, bankTransfer], [noteWrite.key, noteWrite], [assistantChat.key, assistantChat],
]);

export function actionExecutionDefinition(type: CanonicalAction['type']): ExecutionDefinition {
  const definition = registry.get(type);
  if (!definition) throw new Error(`No execution handler is registered for ${type}.`);
  return definition;
}
