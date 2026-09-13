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

test('actions-v1 commits a real model-authored phone note', async () => {
  const story = storyWithTwoCharacters();
  const node = (id: string, type: keyof typeof currentCoreNodeVersions, x: number, data = {}) => ({
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  });
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
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
      const alice = catalog.entries.find((entry: { label: string }) => entry.label === 'Alice');
      return { text: JSON.stringify({ version: 1, catalogId: catalog.catalogId, blocks: [
        { type: 'text', text: 'Alice jots a quick reminder to herself.' },
        { type: 'action', intent: { type: 'note.write', owner: alice.handle, title: 'Reminder', body: 'Buy milk.' } },
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
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice pauses to write something down.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('Alice jots a quick reminder to herself.', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Buy milk.');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { ui: { phoneNotesByCharacter: Record<string, Array<{ title: string; text: string }>> } };
  const allNotes = Object.values(session.ui.phoneNotesByCharacter).flat();
  expect(allNotes.filter((note) => note.title === 'Reminder' && note.text === 'Buy milk.')).toHaveLength(1);
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});
