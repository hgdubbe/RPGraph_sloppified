import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

/**
 * S8, first slice: when a staged turn fails partway through, retrying must not repeat a
 * stage that already committed a real effect. Both specs here force the *second* of two
 * image generations to fail once (comfy generation is the only real effect this app can
 * fail deterministically via IPC mocking — WhatsUp/bank/social/notes effects are plain
 * in-memory state, not IPC round-trips) and assert ComfyUI is asked for exactly one photo
 * per successful generation, never twice for the one that already succeeded.
 *
 * Two things every helper below has to respect, both hard-won debugging this file:
 * 1. `electronApp.evaluate` callbacks run inside the Electron *main* process, stringified
 *    and re-sent - they cannot close over other functions from this test module (only
 *    over their own JSON-serializable second argument). Everything the callback needs
 *    must be defined inside it.
 * 2. A staged content-generation prompt never includes the instance's own `purpose` -
 *    two instances of the *same* recipe (here, two `image.generate` calls, two
 *    `whatsup.message-with-artifact` calls) compile to identical prompts, so they must be
 *    told apart by call order, not by prompt text.
 */
function buildStory() {
  const story = structuredClone(starterRpStorybook);
  story.characters = [
    { ...story.characters[0], name: 'Alice', images: [] },
    { ...structuredClone(story.characters[0]), id: 'bob', name: 'Bob', images: [] },
  ];
  return story;
}

function node(id: string, type: keyof typeof currentCoreNodeVersions, x: number, data: Record<string, unknown> = {}) {
  return {
    id, type: 'workflow', position: { x, y: 40 },
    data: { nodeType: type, nodeDataVersion: currentCoreNodeVersions[type], label: id, description: '', preview: '', connectionId: 'test', ...data },
  };
}

async function setUpElectronMocks(electronApp: LaunchedApp['electronApp'], comfyCallsBeforeFailure: number) {
  await electronApp.evaluate(({ ipcMain, nativeImage }, failOnCall) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    let comfyCalls = 0;
    ipcMain.removeHandler('comfy:run-workflow-path');
    ipcMain.handle('comfy:run-workflow-path', () => {
      comfyCalls += 1;
      if (comfyCalls === failOnCall) {
        throw new Error('Simulated ComfyUI failure for the second photo.');
      }
      return {
        images: [{ filename: `retry-photo-${comfyCalls}.png`, dataUrl: nativeImage.createFromBitmap(Buffer.from([comfyCalls * 30, 120, 200, 255]), { width: 1, height: 1 }).toDataURL() }],
      };
    });
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
  }, comfyCallsBeforeFailure);
  await electronApp.evaluate(({ ipcMain }) => {
    let imagePromptCalls = 0;
    let messageDraftCalls = 0;
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
            { id: 'photo1', recipe: 'image.generate', purpose: 'First photo.', actorId: alice, visibility, args: { ownerId: alice }, inputs: contextInput, dependencies: [] },
            { id: 'message1', recipe: 'whatsup.message-with-artifact', purpose: 'Send the first photo.', actorId: alice, visibility, args: { recipientId: bob },
              inputs: { ...contextInput, attachment: { source: 'output', instanceId: 'photo1', output: 'artifact', kind: 'artifact' } }, dependencies: [] },
            { id: 'photo2', recipe: 'image.generate', purpose: 'Second photo.', actorId: alice, visibility, args: { ownerId: alice }, inputs: contextInput, dependencies: [] },
            { id: 'message2', recipe: 'whatsup.message-with-artifact', purpose: 'Send the second photo.', actorId: alice, visibility, args: { recipientId: bob },
              inputs: { ...contextInput, attachment: { source: 'output', instanceId: 'photo2', output: 'artifact', kind: 'artifact' } }, dependencies: [] },
          ],
          beats: [
            { id: 'b-message1', visibility, content: [{ source: 'output', instanceId: 'message1', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'message1', output: 'receipt', kind: 'receipt' }] },
            { id: 'b-message2', visibility, content: [{ source: 'output', instanceId: 'message2', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'message2', output: 'receipt', kind: 'receipt' }] },
          ],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: image.generate/prompt')) {
        imagePromptCalls += 1;
        return { text: `The photo ${imagePromptCalls} prompt.`, stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: whatsup.message-with-artifact/draft')) {
        messageDraftCalls += 1;
        return { text: `Photo ${messageDraftCalls === 1 ? 'one' : 'two'} incoming!`, stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      throw new Error(`Unexpected staged LLM call: ${request.prompt.slice(0, 200)}`);
    });
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Staged workflow must not stream unvalidated output.'); });
  });
}

function connections() {
  return [
    { id: 'test', label: 'Deterministic test', providerKind: 'lm-studio' as const, baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' },
    { id: 'comfy', kind: 'comfyui' as const, comfyRole: 'image' as const, label: 'Test images',
      baseUrl: 'http://127.0.0.1:9', apiKey: '', model: '', comfyWorkflowPath: 'test.json',
      comfyDiffusionModelName: 'test', comfyVaeName: 'test', comfyTextEncoderName: 'test' },
  ];
}

test('staged workflow v1 retries automatically without regenerating the already-generated photo', async () => {
  const story = buildStory();
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [node('input', 'input', 0), node('output', 'output', 800, { actionProtocol: 'staged-v1' }), node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) })],
    edges: [],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test', connections: connections(),
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click', stagedAutoRetryAttempts: 1 },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setUpElectronMocks(electronApp, 2);
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice sends two photos.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  // Recovers on its own; the manual retry banner must never appear.
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Photo two incoming!', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('alert').filter({ hasText: 'Staged turn failed' })).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Photo two incoming!');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { timeline: Array<{ channel?: string; text?: { original: string }; images?: Array<{ imageId: string }> }> };
  const photo1 = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Photo one incoming!');
  const photo2 = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Photo two incoming!');
  expect(photo1).toHaveLength(1);
  expect(photo2).toHaveLength(1);
  expect(photo1[0].images?.length ?? 0).toBe(1);
  expect(photo2[0].images?.length ?? 0).toBe(1);
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});

test('staged workflow v1 shows a manual retry prompt when auto-retry is off, and recovers on click', async () => {
  const story = buildStory();
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [node('input', 'input', 0), node('output', 'output', 800, { actionProtocol: 'staged-v1' }), node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) })],
    edges: [],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test', connections: connections(),
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click', stagedAutoRetryAttempts: 0 },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setUpElectronMocks(electronApp, 2);
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice sends two photos.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  const banner = page.getByRole('alert').filter({ hasText: 'Staged turn failed' });
  await expect(banner).toBeVisible({ timeout: 20000 });
  await expect(banner).toContainText('Simulated ComfyUI failure for the second photo.');
  await banner.getByRole('button', { name: 'Retry without regenerating' }).click();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Photo two incoming!', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Photo two incoming!');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { timeline: Array<{ channel?: string; text?: { original: string }; images?: Array<{ imageId: string }> }> };
  const photo1 = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Photo one incoming!');
  const photo2 = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Photo two incoming!');
  expect(photo1).toHaveLength(1);
  expect(photo2).toHaveLength(1);
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});

test('staged workflow v1 durably records recovery state for a never-explicitly-saved session, keyed by the rolling autosave slot', async () => {
  const story = buildStory();
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-12T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [node('input', 'input', 0), node('output', 'output', 800, { actionProtocol: 'staged-v1' }), node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) })],
    edges: [],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test', connections: connections(),
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click', stagedAutoRetryAttempts: 0 },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Turn 1: a plain successful narration turn — no "Save RP" ever happens, only the
  // background rolling turn autosave. This alone used to leave `activeSessionFileName`
  // `null` forever, which is exactly why the recovery-write guard never engaged for the
  // most common real usage pattern.
  await electronApp.evaluate(({ ipcMain }) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
    ipcMain.removeHandler('llm:chat-completion');
    ipcMain.handle('llm:chat-completion', (_event, request: { prompt: string }) => {
      if (request.prompt.includes('Return one complete JSON compact plan')) {
        const payload = JSON.parse(request.prompt.split('\n').pop()!);
        const [alice] = payload.characterIds as string[];
        const visibility = { kind: 'characters', characterIds: [alice] };
        const plan = {
          version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
          instances: [{
            id: 'narrate', recipe: 'narration.speech', purpose: 'Set the scene.', actorId: alice, visibility, args: {},
            inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
            dependencies: [],
          }],
          beats: [{ id: 'b1', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }], requiresReceipts: [] }],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: narration.speech/speech')) {
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
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice looks around.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('Alice pauses beside the window.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => (await page.evaluate(() => window.rpgraph.loadTurnAutosave()))?.fileName ?? null).not.toBeNull();
  const anchorFileName = (await page.evaluate(() => window.rpgraph.loadTurnAutosave()))!.fileName;

  // Turn 2: force a mid-turn failure to reach the manual retry banner, then check the
  // durable record directly — keyed by the rolling autosave slot, not by any explicit save.
  await setUpElectronMocks(electronApp, 2);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice sends two photos.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  const banner = page.getByRole('alert').filter({ hasText: 'Staged turn failed' });
  await expect(banner).toBeVisible({ timeout: 20000 });

  const recoveryWhileFailed = await page.evaluate((fileName) => window.rpgraph.readStagedRecovery(fileName), anchorFileName);
  expect(recoveryWhileFailed).not.toBeNull();
  expect(recoveryWhileFailed?.sessionFileName).toBe(anchorFileName);

  await banner.getByRole('button', { name: 'Retry without regenerating' }).click();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Photo two incoming!', { exact: true })).toBeVisible({ timeout: 20000 });
  const recoveryAfterResolve = await page.evaluate((fileName) => window.rpgraph.readStagedRecovery(fileName), anchorFileName);
  expect(recoveryAfterResolve).toBeNull();
  expect(errors).toEqual([]);
});
