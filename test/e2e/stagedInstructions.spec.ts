import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

test('staged workflow v1 sends authored route instructions to the content-call prompt', async () => {
  const story = structuredClone(starterRpStorybook);
  story.characters = [
    { ...story.characters[0], name: 'Alice', images: [] },
  ];
  const node = (id: string, type: keyof typeof currentCoreNodeVersions, x: number, data = {}) => ({
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  });
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [
      node('input', 'input', 0),
      node('output', 'output', 800, {
        actionProtocol: 'staged-v1',
        stagedInstructions: { mode: 'custom', customText: 'Keep every reply under two sentences.' },
      }),
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
        const [alice] = payload.characterIds as string[];
        const visibility = { kind: 'characters', characterIds: [alice] };
        const plan = {
          version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
          instances: [
            { id: 'narrate', recipe: 'narration.speech', purpose: 'Set the scene.', actorId: alice, visibility, args: {},
              inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
              dependencies: [] },
          ],
          beats: [
            { id: 'b-narrate', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }], requiresReceipts: [] },
          ],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: narration.speech/speech')) {
        if (!request.prompt.includes('Keep every reply under two sentences.')) {
          throw new Error('Authored staged instructions missing from content-call prompt.');
        }
        return { text: 'Alice pauses beside the window.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      throw new Error(`Unexpected staged LLM call: ${request.prompt.slice(0, 200)}`);
    });
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Staged workflow must not stream unvalidated output.'); });
  });
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel('Action protocol', { exact: true })).toContainText('Staged');
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice looks around.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('Alice pauses beside the window.', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
});
