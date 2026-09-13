import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

/**
 * The staged-workflow roadmap's own first acceptance target (see
 * docs/superpowers/plans/2026-09-09-staged-workflow.md's "Coverage And Acceptance"):
 * message -> narration -> bank receipt -> message with generated image -> social comment
 * -> narration, all composed deterministically from one compiled plan, presentation order
 * independent of execution/dependency order. Every family this needs (WhatsUp, narration,
 * banking, images, social) is individually covered by its own spec already; this one proves
 * they interleave correctly within a single turn.
 *
 * `social.comment` needs an existing post to attach to (see socialOutputCommits.ts's
 * buildSocialCommentCommit), so this scene also creates that post via a `social.post`
 * instance in the same plan — proven safe to do in one reply by socialActions.spec.ts's
 * actions-v1 case. That instance isn't its own presentation beat (the acceptance scene text
 * doesn't call out a "social post" beat, only "social comment"), but it still executes as
 * part of the plan and the comment instance carries an explicit instance-level dependency
 * on it, so posting is guaranteed to commit (and the post's deterministic id become real)
 * before the comment tries to reference it.
 */
test('staged workflow v1 composes the roadmap\'s first mixed acceptance scene in one turn', async () => {
  const story = structuredClone(starterRpStorybook);
  story.characters = [
    { ...story.characters[0], name: 'Alice', images: [], social: { fotogramUsername: 'alice.reyes', onlyfriendsUsername: '' } },
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
      images: [{ filename: 'mixed-scene-image.png', dataUrl: nativeImage.createFromBitmap(Buffer.from([12, 200, 44, 255]), { width: 1, height: 1 }).toDataURL() }],
    }));
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
  });
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('llm:chat-completion');
    // Both narration.speech instances compile to an identical content-stage prompt (the
    // prompt only carries recipeId/key/locked-arguments/inputs, never the instance's own
    // `purpose`), so they can't be told apart by prompt text - only by call order.
    let narrationCalls = 0;
    ipcMain.handle('llm:chat-completion', (_event, request: { prompt: string }) => {
      if (request.prompt.includes('Return one complete JSON compact plan')) {
        const payload = JSON.parse(request.prompt.split('\n').pop()!);
        const [alice, bob] = payload.characterIds as string[];
        const visibility = { kind: 'characters', characterIds: [alice] };
        const contextInput = { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } };
        const plan = {
          version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
          instances: [
            { id: 'message', recipe: 'whatsup.message', purpose: 'Alice invites Bob over.', actorId: alice, visibility,
              args: { recipientId: bob }, inputs: contextInput, dependencies: [] },
            { id: 'narrate', recipe: 'narration.speech', purpose: 'Set the scene.', actorId: alice, visibility, args: {},
              inputs: contextInput, dependencies: [] },
            { id: 'pay', recipe: 'bank.transfer', purpose: 'Alice pays Bob back.', actorId: alice, visibility,
              args: { fromId: alice, toId: bob, amount: 15 }, inputs: contextInput, dependencies: [] },
            { id: 'photo', recipe: 'image.generate', purpose: 'Alice takes a photo for Bob.', actorId: alice, visibility,
              args: { ownerId: alice }, inputs: contextInput, dependencies: [] },
            { id: 'photoMessage', recipe: 'whatsup.message-with-artifact', purpose: 'Alice sends Bob the photo.', actorId: alice, visibility,
              args: { recipientId: bob },
              inputs: { ...contextInput, attachment: { source: 'output', instanceId: 'photo', output: 'artifact', kind: 'artifact' } },
              dependencies: [] },
            { id: 'post', recipe: 'social.post', purpose: 'Alice posts to Fotogram.', actorId: alice, visibility,
              args: { app: 'fotogram' }, inputs: contextInput, dependencies: [] },
            { id: 'comment', recipe: 'social.comment', purpose: 'Alice comments on her own post.', actorId: alice, visibility,
              args: { app: 'fotogram', postId: 'fotogram-post-01' }, inputs: contextInput,
              dependencies: [{ instanceId: 'post', kind: 'observation' }] },
            { id: 'narrate2', recipe: 'narration.speech', purpose: 'Close the scene.', actorId: alice, visibility, args: {},
              inputs: contextInput, dependencies: [] },
          ],
          beats: [
            { id: 'b-message', visibility, content: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'message', output: 'receipt', kind: 'receipt' }] },
            { id: 'b-narrate', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate', output: 'speech', kind: 'text' }], requiresReceipts: [] },
            { id: 'b-pay', visibility, content: [{ source: 'output', instanceId: 'pay', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'pay', output: 'receipt', kind: 'receipt' }] },
            { id: 'b-photo-message', visibility, content: [{ source: 'output', instanceId: 'photoMessage', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'photoMessage', output: 'receipt', kind: 'receipt' }] },
            { id: 'b-comment', visibility, content: [{ source: 'output', instanceId: 'comment', output: 'receipt', kind: 'receipt' }],
              requiresReceipts: [{ source: 'output', instanceId: 'comment', output: 'receipt', kind: 'receipt' }] },
            { id: 'b-narrate2', speakerId: alice, visibility, content: [{ source: 'output', instanceId: 'narrate2', output: 'speech', kind: 'text' }], requiresReceipts: [] },
          ],
        };
        return { text: JSON.stringify(plan), stats: { elapsedMs: 1, promptTokens: 50, completionTokens: 30 } };
      }
      if (request.prompt.includes('Stage: whatsup.message/draft')) {
        return { text: 'Come over tonight?', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: narration.speech/speech')) {
        narrationCalls += 1;
        return narrationCalls === 1
          ? { text: 'Alice glances at her phone, weighing the evening ahead.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } }
          : { text: 'She sets the phone down, satisfied with how the day turned out.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: bank.transfer/note')) {
        return { text: 'For dinner last week.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: image.generate/prompt')) {
        return { text: 'A cozy living room at dusk.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: whatsup.message-with-artifact/draft')) {
        return { text: 'Here\'s the spot!', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: social.post/draft')) {
        return { text: 'Golden hour at home.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
      }
      if (request.prompt.includes('Stage: social.comment/draft')) {
        return { text: 'Loved how this turned out.', stats: { elapsedMs: 1, promptTokens: 20, completionTokens: 10 } };
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
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice has a busy evening ahead.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  await expect(page.getByText('She sets the phone down, satisfied with how the day turned out.', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Loved how this turned out.');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as {
    timeline: Array<{
      id: string; channel?: string; text?: { original: string };
      images?: Array<{ imageId: string }>; embeddedPhoneMessageIds?: string[];
      bankTransfer?: { from: string; to: string; amount: number; note?: string };
      socialPost?: { app: string; postId: string; caption: string };
      socialReactions?: { app: string; postId: string; comments: Array<{ from: string; text: string }> };
    }>;
  };
  // message
  const invite = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Come over tonight?');
  expect(invite).toHaveLength(1);
  // narration (both)
  expect(JSON.stringify(session)).toContain('Alice glances at her phone, weighing the evening ahead.');
  expect(JSON.stringify(session)).toContain('She sets the phone down, satisfied with how the day turned out.');
  // bank receipt
  const transfers = session.timeline.filter((entry) => entry.bankTransfer);
  expect(transfers).toHaveLength(1);
  expect(transfers[0].bankTransfer).toMatchObject({ from: 'Alice', to: 'Bob', amount: 15, note: 'For dinner last week.' });
  // message with generated image
  const photoMessage = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === "Here's the spot!");
  expect(photoMessage).toHaveLength(1);
  expect(photoMessage[0].images?.length ?? 0).toBe(1);
  // social comment (and the post it depends on)
  const posts = session.timeline.filter((entry) => entry.socialPost?.app === 'fotogram');
  expect(posts).toHaveLength(1);
  expect(posts[0].socialPost).toMatchObject({ postId: 'fotogram-post-01', caption: 'Golden hour at home.' });
  const reactions = session.timeline.filter((entry) => entry.socialReactions?.postId === 'fotogram-post-01');
  expect(reactions.flatMap((entry) => entry.socialReactions?.comments ?? []))
    .toContainEqual(expect.objectContaining({ from: 'Alice', text: 'Loved how this turned out.' }));
  expect(await page.evaluate(() => window.rpgraph.readEffectJournal())).toEqual([]);
});
