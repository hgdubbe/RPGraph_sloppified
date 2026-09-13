import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

function storyWithTwoCharacters() {
  const story = structuredClone(starterRpStorybook);
  story.characters = [
    { ...story.characters[0], name: 'Alice', images: [] },
    { ...structuredClone(story.characters[0]), id: 'bob', name: 'Bob', images: [] },
  ];
  return story;
}

test('actions-v1 delivers a real WhatsUp message flagged as a voice message', async () => {
  const story = storyWithTwoCharacters();
  const node = (id: string, type: keyof typeof currentCoreNodeVersions, x: number, data = {}) => ({
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  });
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-11T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [
      node('input', 'input', 0),
      node('router', 'llm-prompt-switch', 350, {
        llmPromptSwitchOutputTitles: ['Story'], llmPromptSwitchPromptTitlesByOutput: [['Main response']],
        llmPromptSwitchPromptBeforesByOutput: [['Use a warm, understated tone.']], llmPromptSwitchPromptAftersByOutput: [['']],
      }),
      node('output', 'output', 800, { actionProtocol: 'actions-v1', streamOutputEnabled: true }),
      node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) }),
    ],
    edges: [
      { id: 'text', source: 'input', target: 'router', targetHandle: 'text' },
      { id: 'format', source: 'input', sourceHandle: 'message-format', target: 'router', targetHandle: 'output-channel' },
      { id: 'slot', source: 'input', sourceHandle: 'turn-mode', target: 'router', targetHandle: 'prompt-slot' },
      { id: 'reply', source: 'router', sourceHandle: 'output-channel-0', target: 'output' },
    ],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test',
    connections: [{ id: 'test', label: 'Deterministic test', providerKind: 'lm-studio', baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' }],
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click' },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await electronApp.evaluate(({ ipcMain }) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
    ipcMain.removeHandler('llm:chat-completion');
    ipcMain.handle('llm:chat-completion', (_event, request) => {
      if (request.responseContract !== 'actions-v1') throw new Error('Structured response contract was lost before IPC.');
      const catalogText = request.prompt.split('Current action catalog (application state):\n')[1]?.split('\n\n')[0];
      if (!catalogText) throw new Error('Managed catalog missing from provider prompt.');
      const catalog = JSON.parse(catalogText);
      const from = catalog.entries.find((entry: { label: string }) => entry.label === 'Alice');
      const to = catalog.entries.find((entry: { label: string }) => entry.label === 'Bob');
      return { text: JSON.stringify({ version: 1, catalogId: catalog.catalogId, blocks: [
        { type: 'text', text: 'Alice records a quick voice note.' },
        { type: 'action', intent: { type: 'messenger.send', app: 'whatsup', from: from.handle, to: to.handle, text: 'Meet me at the cafe.', isVoiceMessage: true } },
      ] }), stats: { elapsedMs: 1, promptTokens: 100, completionTokens: 40 } };
    });
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Structured output must not stream before validation.'); });
  });
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel('Action protocol', { exact: true })).toContainText('Structured');
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice sends Bob a voice note.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('Alice records a quick voice note.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Meet me at the cafe.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Meet me at the cafe.');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { timeline: Array<{ channel?: string; text?: { original: string }; phone?: { voiceMessage?: boolean } }> };
  const deliveries = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Meet me at the cafe.');
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].phone?.voiceMessage).toBe(true);
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});

test('staged workflow v1 delivers a real WhatsUp message flagged as a voice message', async () => {
  const story = storyWithTwoCharacters();
  const node = (id: string, type: keyof typeof currentCoreNodeVersions, x: number, data = {}) => ({
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  });
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-11T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [
      node('input', 'input', 0),
      node('output', 'output', 800, { actionProtocol: 'staged-v1' }),
      node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) }),
    ],
    edges: [],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test',
    connections: [{ id: 'test', label: 'Deterministic test', providerKind: 'lm-studio', baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' }],
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click' },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await electronApp.evaluate(({ ipcMain }) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
  });
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('llm:chat-completion');
    ipcMain.handle('llm:chat-completion', (_event, request: { prompt: string }) => {
      if (request.prompt.includes('Return one complete JSON compact plan')) {
        const payload = JSON.parse(request.prompt.split('\n').pop()!);
        const [alice, bob] = payload.characterIds as string[];
        const visibility = { kind: 'characters', characterIds: [alice] };
        const plan = {
          version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
          instances: [{
            id: 'voice', recipe: 'voice.message', purpose: 'Send a voice note.', actorId: alice, visibility, args: { recipientId: bob },
            inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
            dependencies: [],
          }],
          beats: [{ id: 'b-voice', visibility, content: [{ source: 'output', instanceId: 'voice', output: 'receipt', kind: 'receipt' }],
            requiresReceipts: [{ source: 'output', instanceId: 'voice', output: 'receipt', kind: 'receipt' }] }],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: voice.message/draft')) {
        return { text: 'Meet me at the cafe.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      throw new Error(`Unexpected staged LLM call: ${request.prompt.slice(0, 200)}`);
    });
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Staged workflow must not stream unvalidated output.'); });
  });
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice sends Bob a voice note.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Meet me at the cafe.', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Meet me at the cafe.');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { timeline: Array<{ channel?: string; text?: { original: string }; phone?: { voiceMessage?: boolean } }> };
  const deliveries = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Meet me at the cafe.');
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].phone?.voiceMessage).toBe(true);
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});
