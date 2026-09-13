import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

/**
 * S8, second slice: an interrupted staged turn's durably persisted retry state (first
 * slice, 2026-09-12) must actually be offered back to the user after an app restart, not
 * just sit on disk. `page.reload()` simulates the restart — it only reloads the renderer,
 * so the main-process IPC mocks (and their closure-scoped call counters) survive it exactly
 * like a real restart would leave real ComfyUI/LM Studio state untouched. See the identical
 * pattern already proven in `turnAutosaveChoice.spec.ts`.
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

function connections() {
  return [
    { id: 'test', label: 'Deterministic test', providerKind: 'lm-studio' as const, baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' },
    { id: 'comfy', kind: 'comfyui' as const, comfyRole: 'image' as const, label: 'Test images',
      baseUrl: 'http://127.0.0.1:9', apiKey: '', model: '', comfyWorkflowPath: 'test.json',
      comfyDiffusionModelName: 'test', comfyVaeName: 'test', comfyTextEncoderName: 'test' },
  ];
}

async function setUpNarrationOnlyMock(electronApp: LaunchedApp['electronApp']) {
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
}

async function setUpTwoPhotoMocks(electronApp: LaunchedApp['electronApp'], comfyCallsBeforeFailure: number) {
  await electronApp.evaluate(({ ipcMain, nativeImage }, failOnCall) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    // Exposed on globalThis (rather than kept as a closure-local) so the test can read the
    // running total directly — this handler survives a `page.reload()` untouched (only the
    // renderer reloads), so this counter is the ground truth for "was ComfyUI called again."
    const globalWithCounter = globalThis as unknown as { __comfyCallCount: number };
    globalWithCounter.__comfyCallCount = 0;
    ipcMain.removeHandler('comfy:run-workflow-path');
    ipcMain.handle('comfy:run-workflow-path', () => {
      globalWithCounter.__comfyCallCount += 1;
      const comfyCalls = globalWithCounter.__comfyCallCount;
      if (comfyCalls === failOnCall) {
        throw new Error('Simulated ComfyUI failure for the second photo.');
      }
      return {
        images: [{ filename: `resume-photo-${comfyCalls}.png`, dataUrl: nativeImage.createFromBitmap(Buffer.from([comfyCalls * 30, 120, 200, 255]), { width: 1, height: 1 }).toDataURL() }],
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

async function launch() {
  const story = buildStory();
  return launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-13T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.7 },
    nodes: [node('input', 'input', 0), node('output', 'output', 800, { actionProtocol: 'staged-v1' }), node('story', 'rp-storybook-editor', 1250, { storybookJson: rpStorybookJsonText(story) })],
    edges: [],
  }, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'test', connections: connections(),
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click', stagedAutoRetryAttempts: 0 },
  });
}

async function reachInterruptedTurn(app: LaunchedApp) {
  const { page, electronApp } = app;
  await setUpNarrationOnlyMock(electronApp);
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterPlayMode(page);

  // Turn 1: a plain successful narration turn, so a turn-autosave anchor file exists —
  // the durable recovery record is keyed to it (see stagedRetry.spec.ts's identical setup).
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice looks around.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('Alice pauses beside the window.', { exact: true })).toBeVisible({ timeout: 20000 });

  // Turn 2: force a mid-turn failure to reach the manual retry banner and the durable write.
  await setUpTwoPhotoMocks(electronApp, 2);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice sends two photos.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  const banner = page.getByRole('alert').filter({ hasText: 'Staged turn failed' });
  await expect(banner).toBeVisible({ timeout: 20000 });
  await expect(banner).toContainText('Simulated ComfyUI failure for the second photo.');
}

test('reopening a session with an interrupted staged turn offers to resume it, and Retry completes without regenerating the already-succeeded photo', async () => {
  app = await launch();
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reachInterruptedTurn(app);

  // Simulate an app restart: only the renderer reloads, so the durable recovery record on
  // disk (and the main-process IPC mocks/call counters) survive exactly like a real restart.
  // Exactly one turn-autosave slot exists (turn 2 was never committed), so startup restores
  // it directly with no multi-slot choice dialog — see turnAutosaveChoice.spec.ts for that
  // separate dialog path.
  await page.reload();
  const resumeBanner = page.getByRole('alert').filter({ hasText: 'Staged turn failed' });
  await expect(resumeBanner).toBeVisible({ timeout: 20000 });
  await expect(resumeBanner).toContainText('Simulated ComfyUI failure for the second photo.');

  // The already-succeeded first photo must never be regenerated on resume: exactly 2
  // ComfyUI calls happened before the restart (one success, one simulated failure), so
  // resuming must add exactly 1 more (the second photo) — never a second attempt at the
  // first, which a regression reusing a fresh plan instead of the persisted one would cause.
  const comfyCallCountBefore = await electronApp.evaluate(() => (globalThis as unknown as { __comfyCallCount: number }).__comfyCallCount);
  expect(comfyCallCountBefore).toBe(2);
  await resumeBanner.getByRole('button', { name: 'Retry without regenerating' }).click();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Photo two incoming!', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  const comfyCallCountAfter = await electronApp.evaluate(() => (globalThis as unknown as { __comfyCallCount: number }).__comfyCallCount);
  expect(comfyCallCountAfter).toBe(comfyCallCountBefore + 1);

  // Known limitation, not a regression: content already delivered *before* the restart
  // (the first photo's phone message) lived only in the crashed process's in-memory
  // `messagesRef` — the whole turn never committed, so nothing durable ever recorded that
  // specific MessageRecord. The persisted variable store still correctly carries its
  // receipt (proving the real effect is known-complete and is never re-run — see the
  // ComfyUI call-count assertion above), but there is nothing left to re-render it from
  // after a real restart. Only the newly-completed second photo is expected to reappear.
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Photo two incoming!');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { fileName: string; timeline: Array<{ channel?: string; text?: { original: string } }> };
  const photo2 = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Photo two incoming!');
  expect(photo2).toHaveLength(1);

  const recoveryAfterResolve = await page.evaluate((fileName) => window.rpgraph.readStagedRecovery(fileName), autosave!.fileName);
  expect(recoveryAfterResolve).toBeNull();
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});

test('dismissing the resume prompt clears the durable record and does not resume', async () => {
  app = await launch();
  const { page } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await reachInterruptedTurn(app);

  await page.reload();
  const resumeBanner = page.getByRole('alert').filter({ hasText: 'Staged turn failed' });
  await expect(resumeBanner).toBeVisible({ timeout: 20000 });
  const anchorFileName = (await page.evaluate(() => window.rpgraph.loadTurnAutosave()))!.fileName;

  await resumeBanner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(resumeBanner).toBeHidden();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Photo two incoming!', { exact: true })).toHaveCount(0);

  const recoveryAfterDismiss = await page.evaluate((fileName) => window.rpgraph.readStagedRecovery(fileName), anchorFileName);
  expect(recoveryAfterDismiss).toBeNull();
  expect(errors).toEqual([]);
});
