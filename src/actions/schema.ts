import type { CanonicalAction } from './contracts';

export const actionLimits = { handle: 128, description: 16_384, text: 65_536, blocks: 128, bankAmount: 1_000_000 } as const;
const nonBlank = { type: 'string', pattern: '\\S' } as const;
const handle = { ...nonBlank, maxLength: actionLimits.handle };
const text = { type: 'string', maxLength: actionLimits.text } as const;
const description = { ...nonBlank, maxLength: actionLimits.description };

function object<P extends Record<string, unknown>>(properties: P, required = Object.keys(properties)) {
  return { type: 'object', properties, required, additionalProperties: false } as const;
}

export const generationSchema = object({ type: { const: 'image.generate' }, owner: handle, description });
export const generatedAttachmentSchema = object({ type: { const: 'generate_image' }, owner: handle, description });
export const storedAttachmentSchema = object({ type: { const: 'stored_image' }, ref: handle });
const booleanFlag = { type: 'boolean' } as const;
export const messengerSchema = {
  ...object({
    type: { const: 'messenger.send' }, app: { const: 'whatsup' }, from: handle, to: handle, text,
    attachment: { oneOf: [storedAttachmentSchema, generatedAttachmentSchema] },
    // Renders as a lazily-synthesized spoken clip instead of plain text; delivery is
    // otherwise identical, so this reuses messenger.send rather than a separate action.
    isVoiceMessage: booleanFlag,
  }, ['type', 'app', 'from', 'to', 'text']),
  // Empty text is only meaningful when a real attachment is requested.
  anyOf: [{ properties: { attachment: {} }, required: ['attachment'] }, { properties: { text: nonBlank } }],
};

const socialApp = { enum: ['fotogram', 'onlyfriends'] } as const;
export const socialPostSchema = object({
  type: { const: 'social.post' }, app: socialApp, author: handle, caption: text,
});
export const socialCommentSchema = object({
  type: { const: 'social.comment' }, app: socialApp, author: handle, postId: handle, text,
});
export const bankTransferSchema = object({
  type: { const: 'bank.transfer' }, from: handle, to: handle,
  amount: { type: 'number', exclusiveMinimum: 0, maximum: actionLimits.bankAmount },
  note: text,
}, ['type', 'from', 'to', 'amount']);
export const noteWriteSchema = object({
  type: { const: 'note.write' }, owner: handle, title: { ...nonBlank, maxLength: actionLimits.handle }, body: text,
  noteId: handle,
}, ['type', 'owner', 'title', 'body']);
const assistantChatMessageSchema = object({ role: { enum: ['user', 'assistant'] }, text: nonBlank });
export const assistantChatSchema = object({
  type: { const: 'assistant.chat' }, owner: handle,
  messages: { type: 'array', minItems: 2, maxItems: 8, items: assistantChatMessageSchema },
}, ['type', 'owner', 'messages']);

export const actionDefinitions = {
  'image.generate': {
    key: 'image.generate',
    description: 'Create an image in the owner gallery without sending it.',
    argumentSchema: generationSchema,
    resultSchema: object({ artifactId: nonBlank, ownerId: nonBlank }),
    retryPolicy: 'reconcile-before-retry',
  },
  'messenger.send': {
    key: 'messenger.send',
    description: 'Deliver one WhatsUp message, optionally with a stored or newly generated image.',
    argumentSchema: messengerSchema,
    resultSchema: object({
      messageId: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      fromId: nonBlank, toId: nonBlank, text, artifactId: nonBlank,
    }, ['messageId', 'fromId', 'toId', 'text']),
    retryPolicy: 'reconcile-before-retry',
  },
  'social.post': {
    key: 'social.post',
    description: 'Create a new text-only Fotogram or OnlyFriends post from the author\'s own account.',
    argumentSchema: socialPostSchema,
    resultSchema: object({ postId: nonBlank, authorId: nonBlank, app: socialApp }),
    retryPolicy: 'reconcile-before-retry',
  },
  'social.comment': {
    key: 'social.comment',
    description: 'Append a comment to an existing Fotogram or OnlyFriends post.',
    argumentSchema: socialCommentSchema,
    resultSchema: object({ postId: nonBlank, authorId: nonBlank, app: socialApp, text }),
    retryPolicy: 'reconcile-before-retry',
  },
  'bank.transfer': {
    key: 'bank.transfer',
    description: 'Commit a bank transfer between two accounts. The backend re-validates the sender\'s balance at execution time regardless of who requested it.',
    argumentSchema: bankTransferSchema,
    resultSchema: object({ fromId: nonBlank, toId: nonBlank, amount: { type: 'number' } }),
    retryPolicy: 'reconcile-before-retry',
  },
  'note.write': {
    key: 'note.write',
    description: 'Create or update an entry in a character\'s phone Notes app.',
    argumentSchema: noteWriteSchema,
    resultSchema: object({ noteId: nonBlank, ownerId: nonBlank }),
    retryPolicy: 'reconcile-before-retry',
  },
  'assistant.chat': {
    key: 'assistant.chat',
    description: 'Simulate and save a character\'s conversation with the phone AI assistant app.',
    argumentSchema: assistantChatSchema,
    resultSchema: object({ chatId: nonBlank, ownerId: nonBlank }),
    retryPolicy: 'reconcile-before-retry',
  },
} as const satisfies Record<CanonicalAction['type'], { key: CanonicalAction['type']; description: string; argumentSchema: unknown; resultSchema: unknown; retryPolicy: 'reconcile-before-retry' }>;

export const textBlockSchema = object({ type: { const: 'text' }, text });
export const actionBlockSchema = object({
  type: { const: 'action' },
  intent: { oneOf: Object.values(actionDefinitions).map((definition) => ({
    ...definition.argumentSchema, description: definition.description,
  })) },
});
export const actionReplySchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  ...object({
    version: { const: 1 }, catalogId: nonBlank,
    blocks: { type: 'array', maxItems: actionLimits.blocks, items: { oneOf: [textBlockSchema, actionBlockSchema] } },
  }),
};

// llama.cpp's union visitor ignores sibling object constraints. Express the
// conditional message rule as two complete, disjoint object alternatives.
const textOnlyMessengerSchema = object({
  type: messengerSchema.properties.type, app: messengerSchema.properties.app,
  from: messengerSchema.properties.from, to: messengerSchema.properties.to,
  text: { ...text, ...nonBlank }, isVoiceMessage: messengerSchema.properties.isVoiceMessage,
}, ['type', 'app', 'from', 'to', 'text']);
const attachedMessengerSchema = object(messengerSchema.properties, ['type', 'app', 'from', 'to', 'text', 'attachment']);
export const actionReplyProviderSchema = {
  ...actionReplySchema,
  properties: {
    ...actionReplySchema.properties,
    blocks: {
      ...actionReplySchema.properties.blocks,
      items: { oneOf: [textBlockSchema, object({
        type: actionBlockSchema.properties.type,
        intent: { oneOf: [generationSchema, textOnlyMessengerSchema, attachedMessengerSchema, socialPostSchema, socialCommentSchema, bankTransferSchema, noteWriteSchema, assistantChatSchema] },
      })] },
    },
  },
};

export function isActionKey(key: string): key is CanonicalAction['type'] {
  return Object.prototype.hasOwnProperty.call(actionDefinitions, key);
}
