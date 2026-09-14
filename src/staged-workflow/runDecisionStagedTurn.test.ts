import { describe, expect, it, vi } from 'vitest';
import type { MessageRecord, WorkflowNode } from '../types';
import { starterRpStorybook, rpStorybookJsonText } from '../nodes/rp-storybook/model';
import { storyCharactersFromNodes } from '../storybook/runtime';
import { runDecisionStagedTurn } from './runDecisionStagedTurn';
import type { StagedActionBridge } from './stagedActionAdapter';

function storyCharacterIds(nodes: WorkflowNode[]): string[] {
  return storyCharactersFromNodes(nodes).map((character) => character.id);
}

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };

function storyNodes(): WorkflowNode[] {
  const story = structuredClone(starterRpStorybook);
  story.characters = ['Alice', 'Bob'].map((name) => ({
    ...structuredClone(story.characters[0]), id: name.toLowerCase(), name,
    banking: { startBalance: 100, fixedExpenses: [] },
    comfyConfig: { appearance: `${name} appearance`, loraName: '' }, images: [],
  }));
  return [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
}

function decisionLlm(script: Record<string, string>) {
  return {
    complete: vi.fn().mockImplementation(async (request: { label: string }) => {
      const text = script[request.label];
      if (text === undefined) throw new Error(`Unscripted call: ${request.label}`);
      return { text };
    }),
  };
}

function mockActionBridge(primaryCharacterId: string, otherCharacterId: string): StagedActionBridge {
  const results: Record<string, unknown> = {
    'image.generate': { type: 'image.generated', artifactId: 'art-1', mediaType: 'image' },
    'social.post': { type: 'social.posted', postId: 'post-1' },
    'note.write': { type: 'note.written', noteId: 'note-1' },
    'assistant.chat': { type: 'assistant.chatted', chatId: 'chat-1' },
    'bank.transfer': { type: 'bank.transferred' },
    'social.comment': { type: 'social.commented', postId: 'post-1' },
    'messenger.send': { type: 'messenger.sent', messageId: 7, fromId: 'a', toId: 'b', text: 'x' },
  };
  return {
    getCatalog: () => ({ scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'c' }, entries: [
      { handle: 'person_1', id: primaryCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
      { handle: 'person_2', id: otherCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
    ] }),
    execute: vi.fn().mockImplementation(async (input: { blocks: Array<{ intent: { type: string } }> }) => ({
      version: 1, blocks: [{ type: 'action', operationId: 'op-1' }],
      operations: [{ id: 'op-1', status: 'committed', result: results[input.blocks[0].intent.type] }],
    })),
  };
}

describe('runDecisionStagedTurn — expanded families', () => {
  it('image: generates an artifact using appearance, never persona, in the picture prompt', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'image',
      'Decision workflow / image / prompt': 'A woman with curly auburn hair standing in golden light.',
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Alice takes a selfie.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([]); // image.generate is presentation:'attachment' — no standalone visible beat
    expect(actionBridge.execute).toHaveBeenCalledTimes(1);
    const promptText = llm.complete.mock.calls.find((c) => c[0].label === 'Decision workflow / image / prompt')![0].prompt as string;
    expect(promptText).toContain('Alice appearance');
  });

  it('note: writes a two-field note (title then body) as a real committed effect, with no visible beat (note.write is state-only)', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'note',
      'Decision workflow / note / title': 'Packing list',
      'Decision workflow / note / body': 'Boots, tent, matches.',
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Alice jots a note.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([]);
    expect(result.runStages.every((stage) => stage.status === 'succeeded')).toBe(true);
    expect(actionBridge.execute).toHaveBeenCalledTimes(1);
  });

  it('bank-transfer: parses "recipient, amount" from the sequence line into real locked arguments, with no visible beat (bank.transfer is receipt-only)', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'bank-transfer: Bob, 25',
      'Decision workflow / bank-transfer / note': 'For the camping gear.',
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Alice pays Bob back.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([]);
    const intent = (actionBridge.execute as ReturnType<typeof vi.fn>).mock.calls[0][0].blocks[0].intent;
    expect(intent).toMatchObject({ type: 'bank.transfer', amount: 25 });
  });

  it('bank-transfer: an unparseable amount skips the block with a warning instead of failing the turn', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'bank-transfer: Bob, a lot',
      'Decision workflow / bank-transfer / note': 'For the camping gear.',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result).toEqual({ status: 'ok', stages: 0, items: [], plan: expect.any(Object), runStages: [], debug: expect.any(Object) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid transfer amount'));
    warn.mockRestore();
  });

  it('social-post: defaults to fotogram when no app is named, and honors an explicit one', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'social-post',
      'Decision workflow / social-post / draft': 'Best campsite view yet.',
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Alice posts a photo caption.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([{ kind: 'receipt', beatId: expect.any(String), speakerId: primaryCharacterId, operationId: 'op-1', receiptId: 'social:post-1' }]);
  });

  it('assistant-chat: parses the drafted JSON conversation into a real committed effect, with no visible beat (assistant.chat is state-only)', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'assistant-chat',
      'Decision workflow / assistant-chat / messages': JSON.stringify([
        { role: 'user', text: 'Any tips for tonight?' },
        { role: 'assistant', text: 'Keep the fire small and dry your boots.' },
      ]),
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Alice asks the assistant.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([]);
    const intent = (actionBridge.execute as ReturnType<typeof vi.fn>).mock.calls[0][0].blocks[0].intent;
    expect(intent.messages).toEqual([
      { role: 'user', text: 'Any tips for tonight?' }, { role: 'assistant', text: 'Keep the fire small and dry your boots.' },
    ]);
  });

  it('assistant-chat: consistently malformed JSON exhausts retries and skips the block with a warning', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({ 'Decision workflow / sequence': 'assistant-chat', 'Decision workflow / assistant-chat / messages': 'not json' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result).toEqual({ status: 'ok', stages: 0, items: [], plan: expect.any(Object), runStages: [], debug: expect.any(Object) });
    expect(warn).toHaveBeenCalled();
    // The sequence call plus 3 retried attempts at the one content node.
    expect(llm.complete).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it('assistant-chat: recovers from a malformed first reply once a retry produces valid JSON, instead of skipping the block', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    let messagesCallCount = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { label: string }) => {
        if (request.label === 'Decision workflow / sequence') return { text: 'assistant-chat' };
        if (request.label === 'Decision workflow / assistant-chat / messages') {
          messagesCallCount++;
          if (messagesCallCount === 1) return { text: 'not json at all' };
          return { text: JSON.stringify([{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello!' }]) };
        }
        throw new Error(`Unscripted call: ${request.label}`);
      }),
    };
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(messagesCallCount).toBe(2);
    const intent = (actionBridge.execute as ReturnType<typeof vi.fn>).mock.calls[0][0].blocks[0].intent;
    expect(intent.messages).toEqual([{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello!' }]);
    const retryPrompt = llm.complete.mock.calls[2][0].prompt as string;
    expect(retryPrompt).toContain('was rejected');
  });

  it('one block\'s call failing (e.g. an empty reply) skips only that block, not the whole turn', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'narration\nnote',
      'Decision workflow / narration / speech': 'Alice settles in for the night.',
      'Decision workflow / note / title': 'Packing list',
      // 'note / body' deliberately unscripted -> decisionLlm throws for it, as a real
      // provider would surface an empty/failed reply.
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([{ kind: 'text', beatId: expect.any(String), speakerId: primaryCharacterId, text: 'Alice settles in for the night.' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipped note'));
    warn.mockRestore();
  });

  it('picture-message: generates a real image and sends it as a real WhatsUp message with the artifact attached (S13: the fix for "images are never sent to anyone")', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'picture-message: Bob',
      'Decision workflow / picture-message / prompt': 'A woman with curly auburn hair standing in golden light.',
      'Decision workflow / picture-message / draft': 'Thought you\'d like this :)',
    });
    // A custom bridge (not `mockActionBridge`) since the catalog must also resolve the
    // generated image artifact by id, for the second (message-send) call's attachment.
    const actionBridge: StagedActionBridge = {
      getCatalog: () => ({ scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'c' }, entries: [
        { handle: 'person_1', id: primaryCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
        { handle: 'person_2', id: otherCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
        { handle: 'image_1', id: 'art-1', saveId: 'save', branchId: 'branch', state: 'available', kind: 'image', accessibleTo: [primaryCharacterId] },
      ] }),
      execute: vi.fn().mockImplementation(async (input: { blocks: Array<{ intent: { type: string } }> }) => {
        const type = input.blocks[0].intent.type;
        if (type === 'image.generate') {
          return { version: 1, blocks: [{ type: 'action', operationId: 'op-image' }], operations: [{ id: 'op-image', status: 'committed', result: { type: 'image.generated', artifactId: 'art-1', mediaType: 'image' } }] };
        }
        return { version: 1, blocks: [{ type: 'action', operationId: 'op-send' }], operations: [{ id: 'op-send', status: 'committed', result: { type: 'messenger.sent', messageId: 9, fromId: primaryCharacterId, toId: otherCharacterId, text: 'x' } }] };
      }),
    };
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Alice sends Bob a selfie.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // The image-generation call and the message-send call are two separate real effects,
    // executed in dependency order (artifact before receipt).
    expect(actionBridge.execute).toHaveBeenCalledTimes(2);
    const imageCall = (actionBridge.execute as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0].blocks[0].intent.type === 'image.generate');
    expect(imageCall?.[0].blocks[0].intent).toMatchObject({ description: 'A woman with curly auburn hair standing in golden light.' });
    const sendCall = (actionBridge.execute as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0].blocks[0].intent.type === 'messenger.send');
    expect(sendCall?.[0].blocks[0].intent).toMatchObject({
      text: 'Thought you\'d like this :)',
      attachment: { type: 'stored_image', ref: 'image_1' },
    });
    expect(result.items).toEqual([{ kind: 'receipt', beatId: expect.any(String), speakerId: primaryCharacterId, operationId: expect.any(String), receiptId: expect.stringContaining('message:') }]);
  });

  it('social-comment: resolves the target author\'s most recent real post and comments on it', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const bobPost: MessageRecord = {
      id: 1, role: 'output', originalText: 'Bob posted.',
      socialPost: { app: 'fotogram', postId: 'post-1', author: 'Bob', authorHandle: '@bob', caption: 'Rainy day hike.' },
    };
    const llm = decisionLlm({
      'Decision workflow / sequence': 'social-comment: Bob',
      'Decision workflow / social-comment / draft': 'Looks so peaceful out there!',
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [bobPost], currentInputText: 'Alice checks Fotogram.', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([{ kind: 'receipt', beatId: expect.any(String), speakerId: primaryCharacterId, operationId: 'op-1', receiptId: 'social:post-1' }]);
    const commentPrompt = llm.complete.mock.calls.find((c) => c[0].label === 'Decision workflow / social-comment / draft')![0].prompt as string;
    expect(commentPrompt).toContain('Rainy day hike.');
    const intent = (actionBridge.execute as ReturnType<typeof vi.fn>).mock.calls[0][0].blocks[0].intent;
    expect(intent).toMatchObject({ type: 'social.comment', app: 'fotogram', postId: 'post-1' });
  });

  it('social-comment: an author with no existing post skips the block with a warning', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'social-comment: Bob',
      'Decision workflow / social-comment / draft': 'Nice!',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result).toEqual({ status: 'ok', stages: 0, items: [], plan: expect.any(Object), runStages: [], debug: expect.any(Object) });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no existing post found by "Bob"'));
    warn.mockRestore();
  });

  it('a multi-family dynamic sequence dispatches every family in the model\'s chosen order', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'narration\nwhatsup-message: Bob\nsocial-post',
      'Decision workflow / narration / speech': 'Alice settles in for the night.',
      'Decision workflow / whatsup-message / draft': 'Hey Bob, made it to camp!',
      'Decision workflow / social-post / draft': 'Camp night one.',
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm, actionBridge });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items.map((item) => item.kind)).toEqual(['text', 'receipt', 'receipt']);
  });
});

describe('runDecisionStagedTurn', () => {
  it('runs a "just narration" turn as sequence call + one content call, composing one text beat', async () => {
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const llm = decisionLlm({
      'Decision workflow / sequence': 'narration',
      'Decision workflow / narration / speech': 'Alice looks up at the stars for a long moment.',
    });
    const result = await runDecisionStagedTurn({
      nodes: storyNodes(), messages: [], currentInputText: 'Alice looks at the sky.', primaryCharacterId, scope, llm,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([
      { kind: 'text', beatId: expect.any(String), speakerId: primaryCharacterId, text: 'Alice looks up at the stars for a long moment.' },
    ]);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('an unparseable sequence reply is a valid, if empty, turn — not a failure', async () => {
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const llm = decisionLlm({ 'Decision workflow / sequence': 'nothing happens this turn' });
    const result = await runDecisionStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result).toEqual({ status: 'ok', stages: 0, items: [], plan: expect.any(Object), runStages: [], debug: expect.any(Object) });
  });

  it('without an action bridge, a whatsup-message block fails at the stubbed effect stage after real drafting', async () => {
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const llm = decisionLlm({
      'Decision workflow / sequence': 'whatsup-message: Bob',
      'Decision workflow / whatsup-message / draft': 'Hey Bob, just checking in.',
    });
    const result = await runDecisionStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result.status).toBe('run-failed');
    if (result.status === 'run-failed') {
      expect(result.error).toContain('not enabled for this run');
      expect(result.stages).toBe(2);
    }
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('with a real action bridge, sends a real WhatsUp message and composes a receipt item', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'whatsup-message: Bob',
      'Decision workflow / whatsup-message / draft': 'Hey Bob, just checking in.',
    });
    const execute = vi.fn().mockResolvedValue({
      version: 1, blocks: [{ type: 'action', operationId: 'op-1' }],
      operations: [{ id: 'op-1', status: 'committed', result: { type: 'messenger.sent', messageId: 7, fromId: 'a', toId: 'b', text: 'Hey Bob, just checking in.' } }],
    });
    const actionBridge: StagedActionBridge = {
      getCatalog: () => ({ scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'c' }, entries: [
        { handle: 'person_1', id: primaryCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: ['whatsup.send'] },
        { handle: 'person_2', id: otherCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
      ] }),
      execute,
    };
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm, actionBridge });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'ok', stages: 2, plan: expect.any(Object), runStages: expect.any(Array), debug: expect.any(Object),
      items: [{ kind: 'receipt', beatId: expect.any(String), speakerId: primaryCharacterId, operationId: 'op-1', receiptId: 'message:7' }],
    });
  });

  it('resumes a failed decision-v1 turn without replanning or redrafting (S8)', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'whatsup-message: Bob',
      'Decision workflow / whatsup-message / draft': 'Hey Bob, just checking in.',
    });
    const failed = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(failed.status).toBe('run-failed');
    if (failed.status !== 'run-failed') return;
    expect(llm.complete).toHaveBeenCalledTimes(2);

    const execute = vi.fn().mockResolvedValue({
      version: 1, blocks: [{ type: 'action', operationId: 'op-1' }],
      operations: [{ id: 'op-1', status: 'committed', result: { type: 'messenger.sent', messageId: 7, fromId: 'a', toId: 'b', text: 'Hey Bob, just checking in.' } }],
    });
    const actionBridge: StagedActionBridge = {
      getCatalog: () => ({ scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'c' }, entries: [
        { handle: 'person_1', id: primaryCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: ['whatsup.send'] },
        { handle: 'person_2', id: otherCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
      ] }),
      execute,
    };
    const resumed = await runDecisionStagedTurn({
      nodes, messages: [], currentInputText: 'irrelevant on resume', scope, llm, actionBridge, resume: failed.retry,
    });
    // Neither the sequence call nor the draft call ran again - only the previously stubbed
    // effect stage retried, this time against a real action bridge.
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(resumed.status).toBe('ok');
  });
});

describe('runDecisionStagedTurn — debug output (S13)', () => {
  it('captures the sequence call and every block call, skipping a draft call for a block dropped upfront for an invalid target', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'narration\nwhatsup-message: Kai',
      'Decision workflow / narration / speech': 'Alice looks at her phone.',
      'Decision workflow / whatsup-message / draft': 'hey Kai!',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({ nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // "Kai" resolves to nobody in this story's cast, so the unknown-recipient check up front
    // (runDecisionStagedTurn.ts) drops the block before ever drafting its content — no wasted
    // "whatsup-message / draft" call here.
    expect(result.debug?.calls.map((call) => call.label)).toEqual([
      'Decision workflow / sequence', 'Decision workflow / narration / speech',
    ]);
    expect(result.debug?.calls[0].response).toBe('narration\nwhatsup-message: Kai');
    expect(result.debug?.warnings).toEqual([expect.stringContaining('unknown recipient "Kai"')]);
    warn.mockRestore();
  });

  it('an empty turn (no blocks at all) still reports an empty debug bundle, not undefined', async () => {
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const llm = decisionLlm({ 'Decision workflow / sequence': 'nothing happens this turn' });
    const result = await runDecisionStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.debug?.calls).toEqual([{ label: 'Decision workflow / sequence', prompt: expect.any(String), response: 'nothing happens this turn' }]);
    expect(result.debug?.warnings).toEqual([]);
  });
});

describe('runDecisionStagedTurn — decisionComposition max-actions-per-turn backstop', () => {
  it('keeps every narration block but drops non-narration blocks beyond the configured cap, in order, with a warning', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'narration\nnote\nnarration\nsocial-post\nassistant-chat',
      'Decision workflow / narration / speech': 'Alice settles in.',
      'Decision workflow / note / title': 'Packing list',
      'Decision workflow / note / body': 'Boots, tent, matches.',
      'Decision workflow / social-post / draft': 'Camp night one.',
      // assistant-chat deliberately unscripted: it must never be reached — it's the 2nd
      // non-narration block and the cap below is 1.
    });
    const actionBridge = mockActionBridge(primaryCharacterId, otherCharacterId);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({
      nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm, actionBridge,
      decisionComposition: { narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 1, respectUserAgency: true, responseLengthText: '' },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Both narration beats survive; only the first non-narration block (note) ran.
    expect(result.items.map((item) => item.kind)).toEqual(['text', 'text']);
    expect(actionBridge.execute).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dropped 2 action block(s) beyond the configured max of 1 per turn'));
    warn.mockRestore();
  });

  it('a cap of 0 allows narration but no actions at all', async () => {
    const nodes = storyNodes();
    const [primaryCharacterId] = storyCharacterIds(nodes);
    const llm = decisionLlm({
      'Decision workflow / sequence': 'narration\nnote',
      'Decision workflow / narration / speech': 'Alice freezes, staring at the wall.',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runDecisionStagedTurn({
      nodes, messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm,
      decisionComposition: { narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 0, respectUserAgency: true, responseLengthText: '' },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([{ kind: 'text', beatId: expect.any(String), speakerId: primaryCharacterId, text: 'Alice freezes, staring at the wall.' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dropped 1 action block(s) beyond the configured max of 0 per turn'));
    warn.mockRestore();
  });
});
