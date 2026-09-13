import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { starterRpStorybook, rpStorybookJsonText } from '../../src/nodes/rp-storybook/model';
import { managedActionPromptSections } from '../../src/actions/promptPreset';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

for (const withImage of [false, true]) {
test(`managed router rules and a single persisted phone receipt (generated image: ${withImage})`, async () => {
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
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-07T00:00:00.000Z',
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
    connections: [{ id: 'test', label: 'Deterministic test', providerKind: 'lm-studio', baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' },
      ...(withImage ? [{ id: 'comfy', kind: 'comfyui' as const, comfyRole: 'image' as const, label: 'Test images',
        baseUrl: 'http://127.0.0.1:9', apiKey: '', model: '', comfyWorkflowPath: 'test.json',
        comfyDiffusionModelName: 'test', comfyVaeName: 'test', comfyTextEncoderName: 'test' }] : [])],
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click' },
  });
  const { page, electronApp } = app;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await electronApp.evaluate(({ ipcMain, nativeImage }, withImage) => {
    for (const channel of ['comfy:check-connection', 'comfy:free-memory', 'lmstudio:unload-models']) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => ({ ok: true, devices: [] }));
    }
    ipcMain.removeHandler('comfy:run-workflow-path');
    ipcMain.handle('comfy:run-workflow-path', () => new Promise((resolve) => {
      ipcMain.once('test:release-image', () => resolve({
        images: [{ filename: 'actual-provider-image.png', dataUrl: nativeImage.createFromBitmap(Buffer.from([255, 128, 32, 255]), { width: 1, height: 1 }).toDataURL() }],
      }));
    }));
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
    ipcMain.removeHandler('llm:chat-completion');
    ipcMain.handle('llm:chat-completion', (_event, request) => {
      if (request.responseContract !== 'actions-v1') throw new Error('Structured response contract was lost before IPC.');
      const catalogText = request.prompt.split('Current action catalog (application state):\n')[1]?.split('\n\n')[0];
      if (!catalogText) throw new Error('Managed catalog missing from provider prompt.');
      const catalog = JSON.parse(catalogText);
      if (!request.prompt.includes('Use a warm, understated tone.') || !request.prompt.includes('Creation alone never implies delivery.')) {
        throw new Error('Authored tone or managed technical instructions missing.');
      }
      const from = catalog.entries.find((entry: { label: string }) => entry.label === 'Alice');
      const to = catalog.entries.find((entry: { label: string }) => entry.label === 'Bob');
      return { text: JSON.stringify({ version: 1, catalogId: catalog.catalogId, blocks: [
        { type: 'text', text: 'Alice pauses beside the window.' },
        { type: 'action', intent: { 'messenger.send': { app: 'whatsup', from: from.handle, to: to.handle, text: 'Meet me at the cafe.',
          ...(withImage ? { attachment: { type: 'generate_image', owner: from.handle, description: 'The cafe entrance at sunset.' } } : {}),
        } } },
        { type: 'text', text: 'She reaches for her coat.' },
      ] }), stats: { elapsedMs: 1, promptTokens: 100, completionTokens: 40 } };
    });
    ipcMain.removeHandler('llm:chat-completion-stream');
    ipcMain.handle('llm:chat-completion-stream', () => { throw new Error('Structured output must not stream before validation.'); });
  }, withImage);
  await page.reload();
  await enterGraphMode(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel('Action protocol', { exact: true })).toContainText('Structured');
  await page.locator('.response-router-node').getByRole('button', { name: /Main response/ }).click();
  const editor = page.getByRole('dialog', { name: 'Response Router editor' });
  const managed = editor.getByRole('region', { name: 'Managed action instructions' });
  await expect(managed).toBeVisible();
  for (const section of managedActionPromptSections) {
    await managed.locator('summary').filter({ hasText: section.title }).click();
    await expect(managed.getByText(section.text, { exact: true })).toBeVisible();
  }
  await expect(managed.locator('textarea, input, select')).toHaveCount(0);
  await page.screenshot({ path: 'test/results/structured-router-managed.png' });
  await page.setViewportSize({ width: 650, height: 820 });
  await managed.scrollIntoViewIfNeeded();
  await expect(managed).toBeVisible();
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test/results/structured-router-narrow.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await editor.getByRole('button', { name: 'Close editor' }).click();
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Alice texts Bob.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  if (withImage) {
    await expect.poll(() => electronApp.evaluate(({ ipcMain }) => ipcMain.listenerCount('test:release-image'))).toBe(1);
    await expect(page.getByRole('region', { name: 'Play Mode', exact: true })).toBeVisible();
    await expect(page.getByLabel('Current workflow step')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    await expect(page.getByText(/Render Error/)).toHaveCount(0);
    await page.screenshot({ path: 'test/results/structured-image-pending.png' });
    await electronApp.evaluate(({ ipcMain }) => { ipcMain.emit('test:release-image'); });
  }
  await expect(page.getByText('Alice pauses beside the window.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('She reaches for her coat.', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Phone messages', exact: true }).getByText('Meet me at the cafe.', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test/results/structured-reply-${withImage ? 'image' : 'text'}.png` });
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
    return JSON.stringify(result);
  }).toContain('Meet me at the cafe.');
  const autosave = await page.evaluate(() => window.rpgraph.loadTurnAutosave());
  const session = autosave?.value as { timeline: Array<{ id: string; channel?: string; text?: { original: string }; images?: Array<{ imageId: string }>; embeddedPhoneMessageIds?: string[] }> };
  const deliveries = session.timeline.filter((entry) => entry.channel === 'phone' && entry.text?.original === 'Meet me at the cafe.');
  expect(deliveries).toHaveLength(1);
  expect(session.timeline.filter((entry) => entry.embeddedPhoneMessageIds?.includes(deliveries[0].id))).toHaveLength(1);
  expect(deliveries[0].images?.length ?? 0).toBe(withImage ? 1 : 0);
  expect(errors).toEqual([]);
});
}
