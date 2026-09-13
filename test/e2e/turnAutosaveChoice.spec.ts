import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

test('startup asks which of two rolling turn autosaves to restore, instead of silently picking one', async () => {
  const story = structuredClone(starterRpStorybook);
  story.characters = [{ ...story.characters[0], name: 'Alice', images: [] }];
  const node = (id: string, type: keyof typeof currentCoreNodeVersions, x: number, data = {}) => ({
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  });
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
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
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Staged workflow must not stream unvalidated output.'); });
  });

  async function mockNarrationTurn(narrationText: string) {
    await electronApp.evaluate(({ ipcMain }, text) => {
      ipcMain.removeHandler('llm:chat-completion');
      ipcMain.handle('llm:chat-completion', (_event, request: { prompt: string }) => {
        if (request.prompt.includes('Return one complete JSON compact plan')) {
          const payload = JSON.parse(request.prompt.split('\n').pop()!);
          const [alice] = payload.characterIds as string[];
          const visibility = { kind: 'characters', characterIds: [alice] };
          const plan = {
            version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
            instances: [{
              id: 'narrate', recipe: 'narration.speech', purpose: 'Continue the scene.', actorId: alice, visibility, args: {},
              inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
              dependencies: [],
            }],
            beats: [{ id: 'b1', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }], requiresReceipts: [] }],
          };
          return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
        }
        if (request.prompt.includes('Stage: narration.speech/speech')) {
          return { text, stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
        }
        throw new Error(`Unexpected staged LLM call: ${request.prompt.slice(0, 200)}`);
      });
    }, narrationText);
  }

  async function runTurn(narrationText: string, inputText: string) {
    await mockNarrationTurn(narrationText);
    await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill(inputText);
    await page.getByRole('button', { name: /Run Chat/ }).click();
    await expect(page.getByText(narrationText, { exact: true })).toBeVisible({ timeout: 20000 });
  }

  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterPlayMode(page);

  // Two committed turns, each triggering a real turn-autosave write, rotating between the
  // two slots (turn-autosave-a / turn-autosave-b in electron/main.cjs).
  await runTurn('Alice pauses beside the window.', 'Alice looks around.');
  await runTurn('Alice sits by the fire.', 'What does Alice do next?');

  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Restore turn autosave' });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await expect(dialog).toContainText('Turn');
  await dialog.getByRole('button', { name: 'Restore' }).first().click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('declining the choice loads the normal startup workflow instead', async () => {
  const story = structuredClone(starterRpStorybook);
  story.characters = [{ ...story.characters[0], name: 'Alice', images: [] }];
  const node = (id: string, type: keyof typeof currentCoreNodeVersions, x: number, data = {}) => ({
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  });
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
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
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Staged workflow must not stream unvalidated output.'); });
  });

  async function mockNarrationTurn(narrationText: string) {
    await electronApp.evaluate(({ ipcMain }, text) => {
      ipcMain.removeHandler('llm:chat-completion');
      ipcMain.handle('llm:chat-completion', (_event, request: { prompt: string }) => {
        if (request.prompt.includes('Return one complete JSON compact plan')) {
          const payload = JSON.parse(request.prompt.split('\n').pop()!);
          const [alice] = payload.characterIds as string[];
          const visibility = { kind: 'characters', characterIds: [alice] };
          const plan = {
            version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
            instances: [{
              id: 'narrate', recipe: 'narration.speech', purpose: 'Continue the scene.', actorId: alice, visibility, args: {},
              inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
              dependencies: [],
            }],
            beats: [{ id: 'b1', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }], requiresReceipts: [] }],
          };
          return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
        }
        if (request.prompt.includes('Stage: narration.speech/speech')) {
          return { text, stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
        }
        throw new Error(`Unexpected staged LLM call: ${request.prompt.slice(0, 200)}`);
      });
    }, narrationText);
  }

  async function runTurn(narrationText: string, inputText: string) {
    await mockNarrationTurn(narrationText);
    await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill(inputText);
    await page.getByRole('button', { name: /Run Chat/ }).click();
    await expect(page.getByText(narrationText, { exact: true })).toBeVisible({ timeout: 20000 });
  }

  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterPlayMode(page);
  await runTurn('Alice pauses beside the window.', 'Alice looks around.');
  await runTurn('Alice sits by the fire.', 'What does Alice do next?');

  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Restore turn autosave' });
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toBeHidden();
  // The fixture workflow (fixture.json) loads normally, with no restored chat history —
  // still in Play Mode from before the reload, showing the storybook's opening line fresh.
  await expect(page.getByText('You have just settled in by the fire, glad for a warm place to rest.')).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
});
