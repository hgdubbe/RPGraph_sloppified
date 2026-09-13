import {
  socialCapability,
  type ActionCatalog, type ActionCatalogEntry, type ActionCompileResult, type ActionPlan,
  type ActionScope, type ActionValidationIssue, type AssistantChatAction, type BankTransferAction, type CanonicalAction,
  type ImageGenerationAction, type MessengerSendAction, type NoteWriteAction, type SocialCommentAction, type SocialPostAction,
} from './contracts';
import {
  actionLimits, actionReplySchema, actionBlockSchema, textBlockSchema,
  assistantChatSchema, bankTransferSchema, generationSchema, messengerSchema, noteWriteSchema, socialPostSchema, socialCommentSchema,
  storedAttachmentSchema, isActionKey,
} from './schema';
import { validateAssistantChatMessages } from './assistantChatMessages';

type PreparedAction =
  | ImageGenerationAction
  | (MessengerSendAction & { generation?: ImageGenerationAction })
  | SocialPostAction
  | SocialCommentAction
  | BankTransferAction
  | NoteWriteAction
  | AssistantChatAction;
type PreparedBlock = { type: 'text'; text: string } | { type: 'action'; action: PreparedAction };

class InvalidAction extends Error {
  constructor(readonly issue: ActionValidationIssue) {
    super(issue.message);
  }
}

function reject(path: string, code: ActionValidationIssue['code'], message: string): never {
  throw new InvalidAction({ path, code, message });
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject(path, 'invalid-shape', 'Expected an object in a complete reply envelope.');
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, schema: { properties: Record<string, unknown> }, path: string) {
  const allowed = Object.keys(schema.properties);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) reject(`${path}.${key}`, 'invalid-shape', `Unexpected field "${key}".`);
  }
}

function string(value: unknown, path: string, limit: number = actionLimits.handle, allowEmpty = false): string {
  // JSON Schema counts Unicode code points, not UTF-16 code units.
  if (typeof value !== 'string' || value.length > limit * 2 || (value.length > limit && Array.from(value).length > limit) || (!allowEmpty && !value.trim())) {
    reject(path, 'invalid-shape', `Expected ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${limit} characters.`);
  }
  return value;
}

function reference<K extends ActionCatalogEntry['kind']>(
  value: unknown, kind: K, catalog: ActionCatalog, scope: ActionScope, path: string,
): Extract<ActionCatalogEntry, { kind: K }> {
  const handle = string(value, path);
  const entry = catalog.entries.find((candidate) => candidate.handle === handle);
  if (!entry) reject(path, 'unknown-reference', `Unknown catalog handle "${handle}". Select an exact current handle.`);
  if (entry.saveId !== scope.saveId || entry.branchId !== scope.branchId) {
    reject(path, 'scope-mismatch', 'Reference belongs to a different save or branch.');
  }
  if (entry.state !== 'available') reject(path, 'unavailable-reference', 'Reference is stale or unavailable.');
  if (entry.kind !== kind) reject(path, 'wrong-reference-type', `Expected a ${kind} reference.`);
  return entry as Extract<ActionCatalogEntry, { kind: K }>;
}

function generation(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): ImageGenerationAction {
  fields(value, generationSchema, path);
  const owner = reference(value.owner, 'character', catalog, scope, `${path}.owner`);
  if (!owner.capabilities.includes('image.generate')) {
    reject(`${path}.owner`, 'unsupported-capability', 'Image generation is unavailable for this owner.');
  }
  return { type: 'image.generate', ownerId: owner.id, description: string(value.description, `${path}.description`, generationSchema.properties.description.maxLength) };
}

function messenger(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): PreparedAction {
  fields(value, messengerSchema, path);
  if (value.app !== messengerSchema.properties.app.const) {
    reject(`${path}.app`, 'unsupported-capability', 'Only WhatsUp is supported by this compiler slice. Other apps remain on the legacy path.');
  }
  const from = reference(value.from, 'character', catalog, scope, `${path}.from`);
  const to = reference(value.to, 'character', catalog, scope, `${path}.to`);
  if (from.id === to.id) reject(`${path}.to`, 'invalid-destination', 'Sender and recipient must be different characters.');
  if (from.allowedRecipientIds && !from.allowedRecipientIds.includes(to.id)) reject(`${path}.to`, 'access-denied', 'This phone contact is blocked.');
  if (!from.capabilities.includes('whatsup.send') || !to.capabilities.includes('whatsup.receive')) {
    reject(path, 'unsupported-capability', 'Sender or recipient does not support this delivery.');
  }
  if (value.isVoiceMessage !== undefined && typeof value.isVoiceMessage !== 'boolean') {
    reject(`${path}.isVoiceMessage`, 'invalid-shape', 'Expected a boolean.');
  }
  const action: MessengerSendAction & { generation?: ImageGenerationAction } = {
    type: 'messenger.send', app: 'whatsup', fromId: from.id, toId: to.id,
    text: string(value.text, `${path}.text`, messengerSchema.properties.text.maxLength, value.attachment !== undefined),
    ...(value.isVoiceMessage === true ? { isVoiceMessage: true } : {}),
  };
  if (value.attachment !== undefined) {
    const pathToAttachment = `${path}.attachment`;
    const attachment = object(value.attachment, pathToAttachment);
    if (attachment.type === 'stored_image') {
      fields(attachment, storedAttachmentSchema, pathToAttachment);
      const image = reference(attachment.ref, 'image', catalog, scope, `${pathToAttachment}.ref`);
      if (!image.accessibleTo.includes(from.id)) reject(`${pathToAttachment}.ref`, 'access-denied', 'Sender cannot access this image.');
      action.attachment = { type: 'artifact', artifactId: image.id };
    } else if (attachment.type === 'generate_image') {
      action.generation = generation(attachment, catalog, scope, pathToAttachment);
      if (action.generation.ownerId !== from.id) {
        reject(`${pathToAttachment}.owner`, 'access-denied', 'A generated attachment must belong to the sender in this compiler slice.');
      }
    } else {
      reject(`${pathToAttachment}.type`, 'invalid-shape', 'Expected stored_image or generate_image.');
    }
  }
  return action;
}

function socialPost(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): SocialPostAction {
  fields(value, socialPostSchema, path);
  if (value.app !== 'fotogram' && value.app !== 'onlyfriends') {
    reject(`${path}.app`, 'invalid-shape', 'Expected fotogram or onlyfriends.');
  }
  const author = reference(value.author, 'character', catalog, scope, `${path}.author`);
  if (!author.capabilities.includes(socialCapability(value.app))) {
    reject(`${path}.author`, 'unsupported-capability', 'This character has no configured account on that app.');
  }
  return {
    type: 'social.post', app: value.app, authorId: author.id,
    caption: string(value.caption, `${path}.caption`, socialPostSchema.properties.caption.maxLength),
  };
}

function socialComment(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): SocialCommentAction {
  fields(value, socialCommentSchema, path);
  if (value.app !== 'fotogram' && value.app !== 'onlyfriends') {
    reject(`${path}.app`, 'invalid-shape', 'Expected fotogram or onlyfriends.');
  }
  const author = reference(value.author, 'character', catalog, scope, `${path}.author`);
  if (!author.capabilities.includes(socialCapability(value.app))) {
    reject(`${path}.author`, 'unsupported-capability', 'This character has no configured account on that app.');
  }
  return {
    type: 'social.comment', app: value.app, authorId: author.id,
    // Existing-post identity is checked by the adapter against live state at execution
    // time, not here — posts are not (yet) enumerated in the compact catalog.
    postId: string(value.postId, `${path}.postId`),
    text: string(value.text, `${path}.text`, socialCommentSchema.properties.text.maxLength),
  };
}

function bankTransfer(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): BankTransferAction {
  fields(value, bankTransferSchema, path);
  const from = reference(value.from, 'character', catalog, scope, `${path}.from`);
  const to = reference(value.to, 'character', catalog, scope, `${path}.to`);
  if (from.id === to.id) reject(`${path}.to`, 'invalid-destination', 'Sender and recipient must be different characters.');
  const amount = value.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > bankTransferSchema.properties.amount.maximum) {
    reject(`${path}.amount`, 'invalid-shape', `Expected a positive number of at most ${bankTransferSchema.properties.amount.maximum}.`);
  }
  // An early, best-effort check against the compile-time catalog snapshot; the
  // authoritative check against live balance happens again right before execution
  // (assertOperationAvailable), since balance can change between compile and execute.
  if (typeof from.bankBalance === 'number' && amount > from.bankBalance) {
    reject(`${path}.amount`, 'unsupported-capability', 'The sender does not have enough balance for this transfer.');
  }
  const note = value.note !== undefined
    ? string(value.note, `${path}.note`, bankTransferSchema.properties.note.maxLength, true)
    : undefined;
  return { type: 'bank.transfer', fromId: from.id, toId: to.id, amount, ...(note?.trim() ? { note } : {}) };
}

function noteWrite(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): NoteWriteAction {
  fields(value, noteWriteSchema, path);
  const owner = reference(value.owner, 'character', catalog, scope, `${path}.owner`);
  const title = string(value.title, `${path}.title`, noteWriteSchema.properties.title.maxLength);
  const body = string(value.body, `${path}.body`, noteWriteSchema.properties.body.maxLength);
  const noteId = value.noteId !== undefined ? string(value.noteId, `${path}.noteId`) : undefined;
  return { type: 'note.write', ownerId: owner.id, title, body, ...(noteId ? { noteId } : {}) };
}

function assistantChat(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): AssistantChatAction {
  fields(value, assistantChatSchema, path);
  const owner = reference(value.owner, 'character', catalog, scope, `${path}.owner`);
  const messages = validateAssistantChatMessages(value.messages, {
    maxTextLength: actionLimits.text,
    fail: (subPath, message) => reject(`${path}.${subPath}`, 'invalid-shape', message),
  });
  return { type: 'assistant.chat', ownerId: owner.id, messages };
}

// Every advertised action requires a compiler; display labels are never keys.
const actionCompilers = {
  'messenger.send': messenger,
  'image.generate': generation,
  'social.post': socialPost,
  'social.comment': socialComment,
  'bank.transfer': bankTransfer,
  'note.write': noteWrite,
  'assistant.chat': assistantChat,
} satisfies Record<CanonicalAction['type'], typeof messenger>;

function prepareBlock(value: unknown, catalog: ActionCatalog, scope: ActionScope, path: string): PreparedBlock {
  const block = object(value, path);
  if (block.type === 'text') {
    fields(block, textBlockSchema, path);
    return { type: 'text', text: string(block.text, `${path}.text`, textBlockSchema.properties.text.maxLength, true) };
  }
  if (block.type !== 'action') reject(`${path}.type`, 'invalid-shape', 'Expected text or action.');
  fields(block, actionBlockSchema, path);
  const intent = object(block.intent, `${path}.intent`);
  const key = string(intent.type, `${path}.intent.type`);
  if (!isActionKey(key)) reject(`${path}.intent.type`, 'unknown-action', `Unknown action "${key}".`);
  const compile = actionCompilers[key];
  return { type: 'action', action: compile(intent, catalog, scope, `${path}.intent`) };
}

function validateCatalog(catalog: ActionCatalog, scope: ActionScope) {
  for (const key of ['saveId', 'branchId', 'turnId', 'catalogId'] as const) {
    if (!scope[key] || catalog.scope[key] !== scope[key]) {
      reject('catalog', 'scope-mismatch', 'Catalog does not belong to the current save, branch and turn.');
    }
  }
  const handles = new Set<string>();
  for (const entry of catalog.entries) {
    if (handles.has(entry.handle)) reject('catalog', 'ambiguous-reference', `Duplicate handle "${entry.handle}".`);
    handles.add(entry.handle);
    string(entry.id, 'catalog.id');
    string(entry.handle, 'catalog.handle');
  }
}

function materialize(blocks: PreparedBlock[], scope: ActionScope, allocateId: () => string): ActionPlan {
  const plan: ActionPlan = { version: 1, scope: { ...scope }, blocks: [], operations: [] };
  const assigned = new Set<string>();
  const id = () => {
    const next = allocateId();
    if (typeof next !== 'string' || !next.trim() || assigned.has(next)) {
      reject('runtime.id', 'invalid-runtime-id', 'The runtime must allocate non-empty, distinct block and operation IDs.');
    }
    assigned.add(next);
    return next;
  };
  for (const block of blocks) {
    const replyBlockId = id();
    if (block.type === 'text') {
      plan.blocks.push({ type: 'text', id: replyBlockId, text: block.text, provisional: true });
      continue;
    }
    const operationId = id();
    const action = block.action;
    const dependsOn: string[] = [];
    let compiled: ImageGenerationAction | MessengerSendAction | SocialPostAction | SocialCommentAction | BankTransferAction | NoteWriteAction | AssistantChatAction;
    if (action.type === 'messenger.send') {
      const { generation: generate, ...delivery } = action;
      compiled = delivery;
      if (generate) {
        const generationId = id();
        plan.operations.push({ id: generationId, scope: { ...scope }, replyBlockId, status: 'validated', dependsOn: [], action: generate });
        dependsOn.push(generationId);
        delivery.attachment = { type: 'operation-result', operationId: generationId };
      }
    } else {
      compiled = action;
    }
    plan.operations.push({ id: operationId, scope: { ...scope }, replyBlockId, status: 'validated', dependsOn, action: compiled });
    plan.blocks.push({ type: 'action', id: replyBlockId, operationId });
  }
  return plan;
}

/** Pure preflight only: accepts a decoded, complete envelope; performs no app or provider effects. */
export function compileActionReply(input: unknown, catalog: ActionCatalog, scope: ActionScope, allocateId: () => string): ActionCompileResult {
  try {
    validateCatalog(catalog, scope);
    const envelope = object(input, 'reply');
    fields(envelope, actionReplySchema, 'reply');
    if (envelope.version !== actionReplySchema.properties.version.const) reject('version', 'invalid-shape', 'Expected action reply version 1.');
    if (envelope.catalogId !== scope.catalogId) reject('catalogId', 'scope-mismatch', 'Use the current catalog.');
    if (!Array.isArray(envelope.blocks) || envelope.blocks.length > actionReplySchema.properties.blocks.maxItems) {
      reject('blocks', 'invalid-shape', `Expected an array of at most ${actionReplySchema.properties.blocks.maxItems} reply blocks.`);
    }
    const prepared: PreparedBlock[] = [];
    const issues: ActionValidationIssue[] = [];
    for (const [index, block] of envelope.blocks.entries()) {
      try {
        prepared.push(prepareBlock(block, catalog, scope, `blocks[${index}]`));
      } catch (error) {
        if (!(error instanceof InvalidAction)) throw error;
        issues.push(error.issue);
      }
    }
    if (issues.length) return { ok: false, issues };
    return { ok: true, plan: materialize(prepared, scope, allocateId) };
  } catch (error) {
    if (!(error instanceof InvalidAction)) throw error;
    return { ok: false, issues: [error.issue] };
  }
}
