import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, enterPlayMode, launchAppWithWorkflow, type LaunchedApp, type WorkflowFixture } from './helpers';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

for (const planning of [false, true]) test(`imports the delivered baseline, runs RP and WhatsUp, and restores autosave (planning: ${planning})`, async () => {
  const baseline = JSON.parse(readFileSync(`workflows/default${planning ? '-planning' : ''}-actions-v1.json`, 'utf8')) as WorkflowFixture;
  app = await launchAppWithWorkflow(baseline, {
    format: 'rpgraph-settings', version: 1, defaultConnectionId: 'lm-studio-default',
    connections: [{ id: 'lm-studio-default', providerKind: 'lm-studio', label: 'Baseline test', baseUrl: 'http://127.0.0.1:9', apiKey: '', model: 'test' }],
    options: { englishProcessingEnabled: false, displayLanguage: 'English', turnAutosaveEnabled: true, dialogueVoiceMode: 'click' },
  });
  const { page, electronApp } = app;
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('lmstudio:list-models');
    ipcMain.handle('lmstudio:list-models', () => [{ id: 'test', name: 'Test', type: 'llm', vision: false, trainedForToolUse: false }]);
    ipcMain.removeHandler('llm:chat-completion');
    ipcMain.handle('llm:chat-completion', (_event, request) => {
      const stats = { elapsedMs: 1, inputTokens: 100, outputTokens: 40 };
      const prompt = request.prompt as string;
      const catalogText = prompt.split('Current action catalog (application state):\n')[1]?.split('\n\n')[0];
      if (!catalogText) {
        if (prompt.includes('Maintain scheduled fictional roleplay events.')) return { stats, text: '{"op":"end"}' };
        if (prompt.includes('MESSAGES NEEDING TIMESTAMPS JSON:')) {
          const pending = JSON.parse(prompt.split('MESSAGES NEEDING TIMESTAMPS JSON:\n')[1].split('\n\n')[0]);
          return { stats, text: JSON.stringify({ t: '2026-09-05T20:00', m: pending.map((entry: { id: number }) => [entry.id, '2026-09-05T20:00']) }) };
        }
        return { stats, text: 'The characters are preparing for their evening together.' };
      }
      if (/@(?:action|command):/i.test(prompt.split('Current action catalog')[0])) throw new Error('Legacy declarations leaked into migrated route.');
      const catalog = JSON.parse(catalogText);
      if (prompt.includes('This is the planning pass')) {
        if (prompt.includes('Return exactly one JSON object with version: 1')) throw new Error('Final action format leaked into planning.');
        return { stats, text: '<think>Discard this internal reasoning draft.</think>Plan checkpoint: keep this scene focused.\n- The character answers the message.' };
      }
      if (prompt.includes('Here is the plan for this turn.') && !prompt.includes('Plan checkpoint: keep this scene focused.')) {
        throw new Error('Planning result did not reach final response.');
      }
      if (prompt.includes('Discard this internal reasoning draft.')) throw new Error('Internal reasoning leaked into final prompt.');
      const helga = catalog.entries.find((entry: { label: string }) => entry.label === 'Helga Harper');
      const espen = catalog.entries.find((entry: { label: string }) => entry.label === 'Espen Harper');
      const phone = prompt.includes('This is the Phone prompt.');
      const reply = JSON.stringify({ version: 1, catalogId: catalog.catalogId, blocks: phone
        ? [{ type: 'action', intent: { type: 'messenger.send', app: 'whatsup', from: helga.handle, to: espen.handle, text: 'Yes, I will meet you downstairs.' } }]
        : [{ type: 'text', text: 'Helga checks the time and reaches for her jacket.' },
          { type: 'action', intent: { type: 'messenger.send', app: 'whatsup', from: helga.handle, to: espen.handle, text: 'Are you ready to leave?' } }],
      });
      return { stats, text: prompt.includes('Here is the plan for this turn.') ? `<think>{"not":"an executable reply"}</think>\n\`\`\`json\n${reply}\n\`\`\`` : reply };
    });
  });
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterGraphMode(page);
  await expect(page.getByLabel('Action protocol', { exact: true })).toContainText('Structured');
  await enterPlayMode(page);
  await page.getByPlaceholder('Click here or press Enter to write. Type /cmd for commands').fill('Helga gets ready to leave.');
  await page.getByRole('button', { name: /Run Chat/ }).click();
  try {
    await expect(page.getByText('Helga checks the time and reaches for her jacket.', { exact: true })).toBeVisible({ timeout: 20000 });
  } catch (error) {
    await enterGraphMode(page);
    await page.getByRole('button', { name: /Open main menu/i }).click();
    await page.getByRole('menuitem', { name: /^Log/ }).click();
    console.log((await page.locator('body').innerText()).slice(-12000));
    throw error;
  }
  await page.getByRole('region', { name: 'Phone messages', exact: true }).getByRole('button').filter({ hasText: 'Are you ready to leave?' }).click();
  const composer = page.getByPlaceholder('Write message', { exact: true });
  await composer.fill('Are you coming downstairs?');
  await page.locator('.phone-composer .phone-send-button').click();
  await expect(page.locator('.phone-thread').getByText('Yes, I will meet you downstairs.', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('tab', { name: 'Espen Harper playing now' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => page.evaluate(async () => JSON.stringify(await window.rpgraph.loadTurnAutosave()).includes('Yes, I will meet you downstairs.'))).toBe(true);
  await page.screenshot({ path: `test/results/action-baseline${planning ? '-planning' : ''}-phone.png` });
  await page.reload();
  // The phone reply committed a second turn autosave, so both rolling slots are now
  // populated and startup asks which one to restore instead of silently picking the
  // newest — choose it explicitly (it's listed newest-first) to keep this test's own
  // expectation (the RP-turn autosave, not the earlier one) unchanged.
  const autosaveDialog = page.getByRole('dialog', { name: 'Restore turn autosave' });
  const autosaveDialogAppeared = await autosaveDialog.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  if (autosaveDialogAppeared) {
    await autosaveDialog.getByRole('button', { name: 'Restore' }).first().click();
  }
  await expect(page.getByText('Helga checks the time and reaches for her jacket.', { exact: true })).toBeVisible({ timeout: 15000 });
  const savedProtocol = await page.evaluate(async () => JSON.stringify(await window.rpgraph.loadTurnAutosave()).includes('"actionProtocol":"actions-v1"'));
  expect(savedProtocol).toBe(true);
  await page.getByRole('button', { name: /Open main menu/i }).click();
  await page.getByRole('menuitem', { name: /^Log/ }).click();
  await expect(page.getByText(/entries \/ 0 errors \/ 0 warnings/)).toBeVisible();
});
