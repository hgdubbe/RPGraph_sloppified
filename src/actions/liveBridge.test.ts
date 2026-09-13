import { describe, expect, it, vi } from 'vitest';
import { createLiveActionBridge } from './liveBridge';
import type { WorkflowNode } from '../types';
import type { ParsedPhoneMessage } from '../chat/phoneMessages';
import { starterRpStorybook, rpStorybookJsonText, withRpStorybookPhoneContactPairBlocked } from '../nodes/rp-storybook/model';
import { storybookImageSourceByIdFromNodes } from '../storybook/imageLibrary';
import type { JournalAdapter } from './runtime';

function fixture() {
  let story = structuredClone(starterRpStorybook);
  const alice = { ...story.characters[0], name: 'Alice', images: [] };
  const bob = { ...structuredClone(alice), id: 'bob', name: 'Bob', images: [] };
  story.characters = [alice, bob];
  const nodes = () => [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
  const append = vi.fn<(message: ParsedPhoneMessage) => number>(() => 42);
  const image = { id: 'alice_you_image_01', name: 'photo', description: 'A sunset', dataUrl: 'data:image/jpeg;base64,AA==', mimeType: 'image/jpeg' as const, size: 1 };
  const generate = vi.fn(async () => {
    story.characters[0].images.push(image);
    return [image];
  });
  const postSocial = vi.fn(async () => ({ postId: 'post-1' }));
  const commentOnSocial = vi.fn(async () => {});
  const transferFunds = vi.fn(async () => {});
  const writeNote = vi.fn(async () => ({ noteId: 'note-1' }));
  const simulateAssistantChat = vi.fn(async () => ({ chatId: 'chat-1' }));
  const bridge = createLiveActionBridge({
    scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' },
    getNodes: nodes, canGenerate: () => true, appendPhoneMessage: append, generateImage: generate,
    postSocial, commentOnSocial, transferFunds, bankBalanceForCharacter: () => 1000, writeNote, simulateAssistantChat,
  });
  const [from, to] = bridge.getCatalog().entries;
  const input = { version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
    type: 'messenger.send', app: 'whatsup', from: from.handle, to: to.handle, text: 'Look',
    attachment: { type: 'generate_image', owner: from.handle, description: 'A sunset' },
  } }] };
  const block = () => { story = withRpStorybookPhoneContactPairBlocked(story, alice.id, bob.id, true); };
  return { bridge, generate, append, postSocial, commentOnSocial, transferFunds, writeNote, simulateAssistantChat, input, block, nodes, image, story };
}

describe('live action bridge', () => {
  it('binds generation to the published editor gallery image, not a model-supplied filename', async () => {
    const f = fixture();
    const result = await f.bridge.execute(f.input);
    expect(result.operations.map((operation) => operation.status)).toEqual(['committed', 'committed']);
    expect(f.generate).toHaveBeenCalledTimes(1);
    expect(f.append).toHaveBeenCalledTimes(1);
    expect(f.append.mock.calls[0][0]).toMatchObject({ imageId: f.image.id, imageAttachments: [f.image] });
    expect(storybookImageSourceByIdFromNodes(f.nodes(), f.image.id)?.image.id).toBe(f.image.id);
  });

  it('threads the voice-message flag through to the delivered phone message', async () => {
    const f = fixture();
    const [from, to] = f.bridge.getCatalog().entries;
    const input = { version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'messenger.send', app: 'whatsup', from: from.handle, to: to.handle, text: 'Look', isVoiceMessage: true,
    } }] };
    const result = await f.bridge.execute(input);
    expect(result.operations[0]).toMatchObject({ status: 'committed', result: { type: 'messenger.sent', isVoiceMessage: true } });
    expect(f.append).toHaveBeenCalledTimes(1);
    expect(f.append.mock.calls[0][0]).toMatchObject({ isVoiceMessage: true });
  });

  it('commits a real bank transfer, re-checking balance against the live catalog', async () => {
    const f = fixture();
    const [from, to] = f.bridge.getCatalog().entries;
    const input = { version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'bank.transfer', from: from.handle, to: to.handle, amount: 25, note: 'For the cab.',
    } }] };
    const result = await f.bridge.execute(input);
    expect(result.operations[0]).toMatchObject({ status: 'committed', result: { type: 'bank.transferred', amount: 25 } });
    expect(f.transferFunds).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice' }), expect.objectContaining({ name: 'Bob' }), 25, 'For the cab.',
    );
  });

  it('commits a real note write, creating a new note for the owner', async () => {
    const f = fixture();
    const [from] = f.bridge.getCatalog().entries;
    const input = { version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'note.write', owner: from.handle, title: 'Reminder', body: 'Buy milk.',
    } }] };
    const result = await f.bridge.execute(input);
    expect(result.operations[0]).toMatchObject({ status: 'committed', result: { type: 'note.written', noteId: 'note-1' } });
    expect(f.writeNote).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }), 'Reminder', 'Buy milk.', undefined);
  });

  it('threads an explicit noteId through to update an existing note', async () => {
    const f = fixture();
    const [from] = f.bridge.getCatalog().entries;
    const input = { version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'note.write', owner: from.handle, title: 'Reminder', body: 'Buy milk.', noteId: 'note-123',
    } }] };
    await f.bridge.execute(input);
    expect(f.writeNote).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }), 'Reminder', 'Buy milk.', 'note-123');
  });

  it('commits a real simulated assistant chat for the owner', async () => {
    const f = fixture();
    const [from] = f.bridge.getCatalog().entries;
    const messages = [
      { role: 'user' as const, text: 'What should I say to Bob?' },
      { role: 'assistant' as const, text: 'Try being honest with him.' },
    ];
    const input = { version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'assistant.chat', owner: from.handle, messages,
    } }] };
    const result = await f.bridge.execute(input);
    expect(result.operations[0]).toMatchObject({ status: 'committed', result: { type: 'assistant.chatted', chatId: 'chat-1' } });
    expect(f.simulateAssistantChat).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alice' }), messages);
  });

  it('rejects a bank transfer the sender can no longer afford, from live catalog balance', async () => {
    const f = fixture();
    const bridge = createLiveActionBridge({
      scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' },
      getNodes: f.nodes, canGenerate: () => true, appendPhoneMessage: f.append, generateImage: f.generate,
      postSocial: f.postSocial, commentOnSocial: f.commentOnSocial,
      transferFunds: f.transferFunds, bankBalanceForCharacter: () => 10, writeNote: f.writeNote,
      simulateAssistantChat: f.simulateAssistantChat,
    });
    const [from, to] = bridge.getCatalog().entries;
    await expect(bridge.execute({ version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'bank.transfer', from: from.handle, to: to.handle, amount: 25,
    } }] })).rejects.toThrow(/balance/i);
    expect(f.transferFunds).not.toHaveBeenCalled();
  });

  it('rejects a blocked contact before spending on image generation', async () => {
    const f = fixture();
    f.block();
    await expect(f.bridge.execute(f.input)).rejects.toThrow(/blocked/i);
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.append).not.toHaveBeenCalled();
  });

  it('keeps generation but prevents delivery when contact permissions change during generation', async () => {
    const f = fixture();
    const generate = f.generate.getMockImplementation()!;
    f.generate.mockImplementation(async () => { const images = await generate(); f.block(); return images; });
    const result = await f.bridge.execute(f.input);
    expect(result.operations.map((operation) => operation.status)).toEqual(['committed', 'failed']);
    expect(f.append).not.toHaveBeenCalled();
    expect(storybookImageSourceByIdFromNodes(f.nodes(), f.image.id)).toBeDefined();
  });

  it('does not deliver an image that the generator has not published to the gallery', async () => {
    const f = fixture();
    f.generate.mockImplementation(async () => [f.image]);
    const result = await f.bridge.execute(f.input);
    expect(result.operations[0].status).toBe('outcome-unknown');
    expect(f.append).not.toHaveBeenCalled();
  });

  it('wires a supplied journal adapter into the shared executor for real effects', async () => {
    const f = fixture();
    const recordAttempt = vi.fn<JournalAdapter['recordAttempt']>(async () => {});
    const recordOutcome = vi.fn<JournalAdapter['recordOutcome']>(async () => {});
    const bridge = createLiveActionBridge({
      scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' },
      getNodes: f.nodes, canGenerate: () => true, appendPhoneMessage: f.append, generateImage: f.generate,
      postSocial: f.postSocial, commentOnSocial: f.commentOnSocial,
      transferFunds: f.transferFunds, bankBalanceForCharacter: () => 1000, writeNote: f.writeNote,
      simulateAssistantChat: f.simulateAssistantChat,
      journal: { recordAttempt, recordOutcome },
    });
    await bridge.execute(f.input);
    expect(recordAttempt).toHaveBeenCalledTimes(2);
    expect(recordOutcome).toHaveBeenCalledTimes(2);
    expect(recordAttempt.mock.calls[0][0]).toMatchObject({ actionType: 'image.generate' });
  });

  it('fails closed for duplicate names while the phone store is name-keyed', () => {
    const f = fixture();
    f.story.characters[1].name = 'Alice';
    expect(() => f.bridge.getCatalog()).toThrow(/unique character names/);
  });
  it('uses actual storybook identity and gallery state, including uncaptioned images', async () => {
    const story = structuredClone(starterRpStorybook);
    const character = story.characters[0];
    character.name = 'Alice';
    character.images = [{ id: 'alice_you_image_01', name: 'photo', description: '', dataUrl: 'data:image/jpeg;base64,AA==', mimeType: 'image/jpeg', size: 1 }];
    const bob = structuredClone(character);
    bob.id = 'bob'; bob.name = 'Bob'; bob.images = [];
    story.characters = [character, bob];
    const nodes = [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
    const append = vi.fn(() => 42);
    const bridge = createLiveActionBridge({
      scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' },
      getNodes: () => nodes, canGenerate: () => false, appendPhoneMessage: append,
      generateImage: async () => { throw new Error('must not generate'); },
      postSocial: async () => { throw new Error('must not post'); },
      commentOnSocial: async () => { throw new Error('must not comment'); },
      transferFunds: async () => { throw new Error('must not transfer'); },
      bankBalanceForCharacter: () => 1000,
      writeNote: async () => { throw new Error('must not write a note'); },
      simulateAssistantChat: async () => { throw new Error('must not simulate a chat'); },
    });
    const catalog = bridge.getCatalog();
    const [from, to] = catalog.entries.filter((entry) => entry.kind === 'character');
    const image = catalog.entries.find((entry) => entry.kind === 'image')!;
    expect(image).toMatchObject({ id: 'alice_you_image_01', accessibleTo: [from.id] });
    const result = await bridge.execute({ version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'messenger.send', app: 'whatsup', from: from.handle, to: to.handle, text: 'Look', attachment: { type: 'stored_image', ref: image.handle },
    } }] });
    expect(result.operations[0]).toMatchObject({ status: 'committed', result: { messageId: 42, artifactId: 'alice_you_image_01' } });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ from: 'Alice', to: 'Bob', imageAttachments: [expect.objectContaining({ id: 'alice_you_image_01' })] }));
  });

  it('posts and comments only for a character with a configured account on that app', async () => {
    const story = structuredClone(starterRpStorybook);
    const alice = { ...story.characters[0], name: 'Alice', images: [], social: { fotogramUsername: 'alice_x', onlyfriendsUsername: '' } };
    // Character Container V2 auto-creates a default enabled Fotogram/WhatsUp account for
    // any character with no `apps` at all, so an explicit disabled entry is required here
    // to represent "no Fotogram account" (an empty legacy `social.fotogramUsername` alone
    // no longer suppresses the default).
    const bob = { ...structuredClone(alice), id: 'bob', name: 'Bob', social: { fotogramUsername: '', onlyfriendsUsername: '' },
      apps: { fotogram: { accountId: 'character:bob:fotogram', enabled: false, username: '', displayName: 'Bob', bio: '' } } };
    story.characters = [alice, bob];
    const nodes = [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
    const postSocial = vi.fn(async () => ({ postId: 'post-1' }));
    const commentOnSocial = vi.fn(async () => {});
    const bridge = createLiveActionBridge({
      scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'catalog' },
      getNodes: () => nodes, canGenerate: () => false,
      appendPhoneMessage: vi.fn(() => 0), generateImage: async () => { throw new Error('must not generate'); },
      postSocial, commentOnSocial,
      transferFunds: async () => { throw new Error('must not transfer'); },
      bankBalanceForCharacter: () => 1000,
      writeNote: async () => { throw new Error('must not write a note'); },
      simulateAssistantChat: async () => { throw new Error('must not simulate a chat'); },
    });
    const catalog = bridge.getCatalog();
    const [aliceEntry, bobEntry] = catalog.entries.filter((entry) => entry.kind === 'character');
    expect(aliceEntry).toMatchObject({ capabilities: expect.arrayContaining(['fotogram.social']) });
    expect(bobEntry.kind === 'character' && bobEntry.capabilities).not.toContain('fotogram.social');

    const posted = await bridge.execute({ version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'social.post', app: 'fotogram', author: aliceEntry.handle, caption: 'Sunset walk.',
    } }] });
    expect(posted.operations[0]).toMatchObject({ status: 'committed', result: { type: 'social.posted', postId: 'post-1' } });
    expect(postSocial).toHaveBeenCalledWith(expect.objectContaining({ id: aliceEntry.id }), 'fotogram', 'Sunset walk.');

    const commented = await bridge.execute({ version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'social.comment', app: 'fotogram', author: aliceEntry.handle, postId: 'post-1', text: 'Lovely.',
    } }] });
    expect(commented.operations[0]).toMatchObject({ status: 'committed', result: { type: 'social.commented', postId: 'post-1' } });

    await expect(bridge.execute({ version: 1, catalogId: 'catalog', blocks: [{ type: 'action', intent: {
      type: 'social.post', app: 'fotogram', author: bobEntry.handle, caption: 'No account here.',
    } }] })).rejects.toThrow(/no configured account|unsupported/i);
    expect(postSocial).toHaveBeenCalledTimes(1);
  });
});
