import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

test('staged workflow v1 generates a real image artifact and delivers it as a WhatsUp attachment', async () => {
  const story = structuredClone(starterRpStorybook);
  story.characters = [
    { ...story.characters[0], name: 'Alice', images: [] },
    { ...structuredClone(story.characters[0]), id: 'bob', name: 'Bob', images: [] },
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
      node('output', 'output', 800, { actionProtocol: 'staged-v1' }),
      node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) }),
    ],
    edges: [],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test',
    connections: [
      { id: 'test', label: 'Deterministic test', providerKind: 'lm-studio', baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' },
      { id: 'comfy', kind: 'comfyui', comfyRole: 'image', label: 'Test images',
        baseUrl: 'http://127.0.0.1:9', apiKey: '', model: '', comfyWorkflowPath: 'test.json',
        comfyDiffusionModelName: 'test', comfyVaeName: 'test', comfyTextEncoderName: 'test' },
    ],
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click' },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await electronApp.evaluate(({ ipcMain, nativeImage }) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    ipcMain.removeHandler('comfy:run-workflow-path');
    ipcMain.handle('comfy:run-workflow-path', () => ({
      images: [{ filename: 'staged-generated-image.png', dataUrl: nativeImage.createFromBitmap(Buffer.from([64, 200, 96, 255]), { width: 1, height: 1 }).toDataURL() }],
    }));
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
        const contextInput = { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } };
        const plan = {
          version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
          instances: [
            { id: 'image', recipe: 'image.generate', purpose: 'Alice takes a photo for Bob.', actorId: alice, visibility,
              args: { ownerId: alice }, inputs: contextInput, dependencies: [] },
            { id: 'message', recipe: 'whatsup.message-with-artifact', purpose: 'Alice sends Bob the photo.', actorId: alice, visibility,
              args: { recipientId: bob },
              inputs: { ...contextInput, attachment: { source: 'output', instanceId: 'image', output: 'artifact', kind: 'artifact' } },
              dependencies: [] },
          ],
          beats: [
            { id: 'b-message', visibility, content: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }] },
          ],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: image.generate/prompt')) {
        return { text: 'A sunlit cafe entrance.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: whatsup.message-with-artifact/draft')) {
        return { text: 'Look what I found today!', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
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
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice takes a photo to send Bob.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Look what I found today!', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Look what I found today!');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as {
    timeline: Array<{ id: string; channel?: string; text?: { original: string }; images?: Array<{ imageId: string }>; embeddedPhoneMessageIds?: string[] }>;
  };
  const deliveries = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Look what I found today!');
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].images?.length ?? 0).toBe(1);
  expect(session.timeline.filter((entry) => entry.embeddedPhoneMessageIds?.includes(deliveries[0].id))).toHaveLength(1);
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});
