import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { readFileSync } from 'node:fs';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

test('edits step-specific fields, copies once, explains policies, and preserves Apply', async () => {
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-07T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.8 }, edges: [], nodes: [{ id: 'router', type: 'workflow', position: { x: 40, y: 20 }, data: {
      nodeType: 'llm-prompt-switch', nodeDataVersion: currentCoreNodeVersions['llm-prompt-switch'], label: 'Sections router', description: '', preview: '',
      llmPromptSwitchOutputTitles: ['Story'], llmPromptSwitchPromptTitlesByOutput: [['RP', 'Narrator']],
      llmPromptSwitchPromptBeforesByOutput: [['', '']],
      llmPromptSwitchPromptAftersByOutput: [[
        '@step:planning\nThis is the planning pass.\n\nCharacters only know what they saw.\n\n@step:main\nThis is the response.\n\nThe tone is warm.',
        'This is the narrator response.\n\nThe tone is dry and restrained.',
      ]],
    } }],
  });
  const { page } = app;
  await enterGraphMode(page);
  await page.getByRole('button', { name: 'Edit routes', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Response Router editor' });
  await expect(editor.getByRole('tab', { name: /planning/ })).toBeVisible();
  await expect(editor.getByLabel('New section category').locator('option[value="tone"]')).toHaveCount(0);
  await editor.getByRole('tab', { name: /Main response/ }).click();
  await editor.locator('.router-prompt-section summary').filter({ hasText: 'Tone' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await editor.getByLabel('Copy Tone from').selectOption({ index: 1 });
  await expect(editor.getByLabel('Tone instructions', { exact: true })).toHaveValue('The tone is dry and restrained.');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor.getByRole('status')).toHaveText('Applied');
  await editor.getByRole('navigation', { name: 'Router routes' }).getByRole('button', { name: /Narrator/ }).click();
  await editor.locator('.router-prompt-section summary').filter({ hasText: 'Tone' }).click();
  await editor.getByLabel('Tone instructions', { exact: true }).fill('Source changed independently.');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await editor.getByRole('navigation', { name: 'Router routes' }).getByRole('button', { name: /^RP / }).click();
  await editor.getByRole('tab', { name: /Main response/ }).click();
  await editor.locator('.router-prompt-section summary').filter({ hasText: 'Tone' }).click();
  await expect(editor.getByLabel('Tone instructions', { exact: true })).toHaveValue('The tone is dry and restrained.');
  await editor.getByLabel('New section category').selectOption('wording');
  await editor.getByRole('button', { name: 'Add section', exact: true }).click();
  await editor.locator('.router-prompt-section summary').filter({ hasText: 'Vocabulary' }).click();
  await editor.getByLabel('Vocabulary and word usage instructions').fill('Use plain, concrete words.');
  await editor.getByLabel('Name for Vocabulary and word usage').fill('Writing style');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.screenshot({ path: 'test/results/prompt-sections-desktop.png' });
  await editor.getByText('Routing and compatibility', { exact: true }).click();
  await editor.getByLabel('Help: Selector policy', { exact: true }).click();
  await expect(editor.getByText(/Example: output 0 and prompt 1.9/)).toBeVisible();
  await page.setViewportSize({ width: 650, height: 750 });
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test/results/prompt-sections-narrow.png' });
});

test('bundled planning workflow uses coherent topics and supports regrouping', async () => {
  const workflow = JSON.parse(readFileSync('workflow.default_planning_v25.json', 'utf8'));
  const node = workflow.nodes.find((entry: { data: { nodeType: string } }) => entry.data.nodeType === 'llm-prompt-switch');
  app = await launchAppWithWorkflow({ ...workflow, nodes: [{ ...node, position: { x: 40, y: 20 } }], edges: [], viewport: { x: 0, y: 0, zoom: 0.7 } });
  const { page } = app;
  await page.setViewportSize({ width: 1440, height: 950 });
  await enterGraphMode(page);
  await page.getByRole('button', { name: 'Edit routes', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Response Router editor' });
  await editor.getByRole('navigation').getByRole('button', { name: /^RP Prompt No Image / }).click();
  await expect(editor.getByRole('tab', { name: /planning/ })).toBeVisible();
  await expect(editor.locator('.router-prompt-section')).toHaveCount(9);
  await page.screenshot({ path: 'test/results/default-planning-sections.png' });
  await editor.getByRole('tab', { name: /Main response/ }).click();
  await expect(editor.locator('.router-prompt-section')).toHaveCount(5);
  await expect(editor.locator('.router-prompt-section summary').filter({ hasText: 'Instructions' })).toHaveCount(0);
  page.on('dialog', (dialog) => dialog.accept());
  await editor.getByRole('button', { name: 'Regroup by topic', exact: true }).click();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor.getByRole('status')).toHaveText('Applied');
  await page.screenshot({ path: 'test/results/default-response-sections.png' });
});
