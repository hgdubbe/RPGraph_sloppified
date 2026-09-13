import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

test('staged workflow v1 commits one narration beat and one persisted phone receipt', async () => {
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
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-11T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    // Staged mode never evaluates the node graph's LLM routing, so no router/edges are needed.
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
          instances: [
            { id: 'narrate', recipe: 'narration.speech', purpose: 'Set the scene.', actorId: alice, visibility, args: {},
              inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
              dependencies: [] },
            { id: 'message', recipe: 'whatsup.message', purpose: 'Invite Bob.', actorId: alice, visibility, args: { recipientId: bob },
              inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
              dependencies: [] },
          ],
          beats: [
            { id: 'b-narrate', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }], requiresReceipts: [] },
            { id: 'b-message', visibility, content: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }] },
          ],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: narration.speech/speech')) {
        return { text: 'Alice pauses beside the window.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: whatsup.message/draft')) {
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
  await expect(page.getByLabel('Action protocol', { exact: true })).toContainText('Staged');
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice texts Bob.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('Alice pauses beside the window.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Meet me at the cafe.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test/results/staged-workflow-reply.png' });
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Meet me at the cafe.');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { timeline: Array<{ id: string; channel?: string; text?: { original: string }; embeddedPhoneMessageIds?: string[] }> };
  const deliveries = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Meet me at the cafe.');
  expect(deliveries).toHaveLength(1);
  expect(session.timeline.filter((entry) => entry.embeddedPhoneMessageIds?.includes(deliveries[0].id))).toHaveLength(1);
  expect(errors).toEqual([]);
  // H7: the turn committed, so the effect journal must not still be carrying its entries.
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});

test('H7 effect journal durably records a real effect even when it fails, and is not cleared', async () => {
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
    // A configured image provider is required so the catalog actually advertises
    // image.generate capability (otherwise the operation is rejected before the durable
    // attempt is ever recorded, which is a different — also-correct — code path). Staged
    // mode's own image runner works now (2026-09-12, see comfyImageRunner.ts), but this
    // fake ComfyUI connection's baseUrl points nowhere real, so the actual generation call
    // still fails (a connection error, not "adapter unavailable") — still a real-effect
    // failure exercised with no IPC mocking of the comfy channel itself.
    connections: [{ id: 'test', label: 'Deterministic test', providerKind: 'lm-studio', baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' },
      { id: 'comfy', kind: 'comfyui' as const, comfyRole: 'image' as const, label: 'Test images',
        baseUrl: 'http://127.0.0.1:9', apiKey: '', model: '', comfyWorkflowPath: 'test.json',
        comfyDiffusionModelName: 'test', comfyVaeName: 'test', comfyTextEncoderName: 'test' }],
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click' },
  });
  const { page, electronApp } = app;
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
        // No ComfyUI/image provider is configured, so this image.generate attempt is
        // guaranteed to fail once its draft prompt is drawn up — a real, deterministic
        // way to exercise "attempt recorded, then the real effect fails" without mocking
        // internals directly.
        const plan = {
          version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
          instances: [{
            id: 'photo', recipe: 'image.generate', purpose: 'Take a photo.', actorId: alice, visibility, args: { ownerId: alice },
            inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
            dependencies: [],
          }],
          beats: [{ id: 'b-photo', visibility, content: [{ source: 'output', instanceId: 'photo', output: 'artifact', kind: 'artifact' }], requiresReceipts: [] }],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: image.generate/prompt')) {
        return { text: 'A sunset over the harbor.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
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
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice takes a photo.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect.poll(async () => (await page.evaluate(() => window.rpgraph.readEffectJournal())).length, { timeout: 20000 }).toBe(1);
  const entries = await page.evaluate(() => window.rpgraph.readEffectJournal());
  expect(entries[0]).toMatchObject({ actionType: 'image.generate', status: 'failed' });
  expect(typeof entries[0].error).toBe('string');
  // Nothing was committed, so autosave must not exist/contain this attempt.
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  expect(JSON.stringify(autosave ?? '')).not.toContain('A sunset over the harbor.');
});
