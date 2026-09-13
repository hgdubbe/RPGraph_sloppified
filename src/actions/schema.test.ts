import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { actionDefinitions, actionReplySchema, actionReplyProviderSchema } from './schema';
import { compileActionReply } from './compileReply';
import { managedActionPromptSections } from './promptPreset';
import { actionExecutionDefinition } from './executionRegistry';
import type { ActionCatalog } from './contracts';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' };
const catalog: ActionCatalog = { scope, entries: [
  { ...scope, id: 'a', handle: 'person_1', kind: 'character', state: 'available', capabilities: ['whatsup.send', 'image.generate', 'fotogram.social'] },
  { ...scope, id: 'b', handle: 'person_2', kind: 'character', state: 'available', capabilities: ['whatsup.receive'] },
  { ...scope, id: 'img', handle: 'image_1', kind: 'image', state: 'available', accessibleTo: ['a'] },
] };
const send = { type: 'messenger.send', app: 'whatsup', from: 'person_1', to: 'person_2', text: 'Hello' };
const post = { type: 'social.post', app: 'fotogram', author: 'person_1', caption: 'Look at this!' };
const comment = { type: 'social.comment', app: 'fotogram', author: 'person_1', postId: 'fotogram-post-01', text: 'Nice!' };
const transfer = { type: 'bank.transfer', from: 'person_1', to: 'person_2', amount: 25 };
const note = { type: 'note.write', owner: 'person_1', title: 'Reminder', body: 'Buy milk.' };
const chat = { type: 'assistant.chat', owner: 'person_1', messages: [
  { role: 'user', text: 'What should I say to Bob?' },
  { role: 'assistant', text: 'Try being honest with him.' },
] };
const reply = (intent: unknown) => ({ version: 1, catalogId: scope.catalogId, blocks: [{ type: 'action', intent }] });
const ajv = new Ajv({ strict: true });
const validate = ajv.compile(actionReplySchema);
const validateProvider = ajv.compile(actionReplyProviderSchema);
function accepts(input: unknown) {
  let id = 0;
  return compileActionReply(input, catalog, scope, () => `id-${++id}`).ok;
}

describe('shared action schemas', () => {
  it.each([
    reply(send),
    reply({ ...send, text: '', attachment: { type: 'stored_image', ref: 'image_1' } }),
    reply({ ...send, attachment: { type: 'generate_image', owner: 'person_1', description: 'A portrait' } }),
    reply({ type: 'image.generate', owner: 'person_1', description: 'A portrait' }),
    reply(post),
    reply(comment),
    reply({ ...send, isVoiceMessage: true }),
    reply({ ...send, isVoiceMessage: false }),
    reply({ ...send, isVoiceMessage: true, attachment: { type: 'stored_image', ref: 'image_1' } }),
    reply(transfer), reply({ ...transfer, note: 'For the cab.' }),
    reply(note), reply({ ...note, noteId: 'note-123' }),
    reply(chat), reply({ ...chat, messages: [...chat.messages, chat.messages[0], chat.messages[1]] }),
    { version: 1, catalogId: 'catalog', blocks: [] },
    { version: 1, catalogId: 'catalog', blocks: [{ type: 'text', text: '' }] },
  ])('agrees with the compiler on accepted input %#', (input) => {
    expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
    expect(validateProvider(input), JSON.stringify(validateProvider.errors)).toBe(true);
    expect(accepts(input)).toBe(true);
  });
  it.each([
    reply({ ...send, text: '   ' }), reply({ ...send, text: null }),
    reply({ ...send, extra: true }), reply({ ...send, attachment: null }),
    reply({ ...send, attachment: { type: 'stored_image', ref: 'image_1', extra: true } }),
    reply({ ...send, attachment: { type: 'generate_image', owner: 'person_1', description: ' ' } }),
    reply({ ...send, type: 'invented' }), reply({ ...send, app: 'fotogram' }),
    reply({ type: 'image.generate', owner: 'person_1', description: 'x'.repeat(16_385) }),
    reply({ ...send, text: 'x'.repeat(65_537) }),
    reply({ ...post, app: 'myspace' }), reply({ ...post, extra: true }),
    reply({ ...comment, postId: null }),
    reply({ ...send, isVoiceMessage: 'yes' }),
    reply({ ...transfer, amount: 0 }), reply({ ...transfer, amount: -5 }), reply({ ...transfer, extra: true }),
    reply({ ...note, title: '   ' }), reply({ ...note, extra: true }), reply({ ...note, owner: null }),
    reply({ ...chat, extra: true }), reply({ ...chat, messages: [chat.messages[0]] }),
    reply({ ...chat, messages: [{ role: 'moderator', text: 'Hi.' }, chat.messages[1]] }),
    reply({ ...chat, messages: [{ role: 'user', text: '   ' }, chat.messages[1]] }),
    { version: 1, catalogId: 'catalog', blocks: Array.from({ length: 129 }, () => ({ type: 'text', text: '' })) },
  ])('agrees with the compiler on rejected input %#', (input) => {
    expect(validate(input)).toBe(false);
    expect(validateProvider(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
  it('keeps catalog authorization separate from structural schema validation', () => {
    const input = reply({ ...send, to: 'unknown_handle' });
    expect(validate(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });
  it('uses JSON Schema character counts for non-BMP message text', () => {
    const input = reply({ ...send, text: '\u{1f600}'.repeat(40_000) });
    expect(validate(input)).toBe(true);
    expect(accepts(input)).toBe(true);
  });
  it('publishes the same machine schema in the managed technical prompt', () => {
    const section = managedActionPromptSections.find((section) => section.id === 'action-schema');
    expect(section?.text).toBe(JSON.stringify(actionReplySchema));
  });
  it('requires an executor and valid receipt schema for every advertised action', () => {
    for (const definition of Object.values(actionDefinitions)) {
      expect(actionExecutionDefinition(definition.key)?.retryPolicy).toBe(definition.retryPolicy);
      const result = ajv.compile(definition.resultSchema);
      expect(result({})).toBe(false);
    }
    const image = ajv.compile(actionDefinitions['image.generate'].resultSchema);
    expect(image({ ownerId: 'a', artifactId: 'img' })).toBe(true);
    expect(image({ ownerId: 'a', artifactId: ' ' })).toBe(false);
    const message = ajv.compile(actionDefinitions['messenger.send'].resultSchema);
    expect(message({ messageId: 1, fromId: 'a', toId: 'b', text: '' })).toBe(true);
    expect(message({ messageId: -1, fromId: 'a', toId: 'b', text: '' })).toBe(false);
    const socialPost = ajv.compile(actionDefinitions['social.post'].resultSchema);
    expect(socialPost({ postId: 'fotogram-post-01', authorId: 'a', app: 'fotogram' })).toBe(true);
    expect(socialPost({ postId: '', authorId: 'a', app: 'fotogram' })).toBe(false);
    const socialComment = ajv.compile(actionDefinitions['social.comment'].resultSchema);
    expect(socialComment({ postId: 'fotogram-post-01', authorId: 'a', app: 'fotogram', text: 'Nice!' })).toBe(true);
    expect(socialComment({ postId: 'fotogram-post-01', authorId: 'a', app: 'myspace', text: 'Nice!' })).toBe(false);
    const bankTransfer = ajv.compile(actionDefinitions['bank.transfer'].resultSchema);
    expect(bankTransfer({ fromId: 'a', toId: 'b', amount: 25 })).toBe(true);
    expect(bankTransfer({ fromId: 'a', toId: 'b', amount: '25' })).toBe(false);
    const noteWrite = ajv.compile(actionDefinitions['note.write'].resultSchema);
    expect(noteWrite({ noteId: 'note-1', ownerId: 'a' })).toBe(true);
    expect(noteWrite({ noteId: '', ownerId: 'a' })).toBe(false);
    const assistantChat = ajv.compile(actionDefinitions['assistant.chat'].resultSchema);
    expect(assistantChat({ chatId: 'chat-1', ownerId: 'a' })).toBe(true);
    expect(assistantChat({ chatId: '', ownerId: 'a' })).toBe(false);
  });
});
