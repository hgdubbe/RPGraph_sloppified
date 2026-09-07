import { expect, test } from '@playwright/test';
import { cleanup, enterGraphMode, launchAppWithWorkflow, type LaunchedApp } from './helpers';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';

let app: LaunchedApp | undefined;
test.afterEach(async () => { await cleanup(app); app = undefined; });

test('keeps 100 routes searchable with one handle per output and keyboard access', async () => {
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-07T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 0.6 }, edges: [], nodes: [{ id: 'router', type: 'workflow', position: { x: 40, y: 20 }, data: {
      nodeType: 'llm-prompt-switch', nodeDataVersion: '1.3.1', label: 'Large router', description: '', preview: '',
      llmPromptSwitchOutputTitles: Array.from({ length: 10 }, (_, index) => `Group ${index}`),
      llmPromptSwitchPromptTitlesByOutput: Array.from({ length: 10 }, (_, group) => Array.from({ length: 10 }, (_, route) => `Route ${group}-${route}`)),
    } }],
  });
  const { page } = app;
  await enterGraphMode(page);
  const card = page.locator('.response-router-node');
  await expect(card.locator('.router-output')).toHaveCount(10);
  await expect(card.locator('.react-flow__handle.source')).toHaveCount(10);
  await card.getByRole('button', { name: 'Edit routes' }).focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog', { name: 'Response Router editor' });
  await editor.getByRole('textbox', { name: 'Search routes' }).fill('Route 9-9');
  await editor.getByRole('button', { name: /Route 9-9/ }).click();
  await expect(editor.locator('.router-editor-context')).toContainText('Selected by (9, 9)');
  await expect(card.locator('.react-flow__handle.source')).toHaveCount(10);
  await page.screenshot({ path: 'test/results/response-router-large.png' });
});

test('shows real routes and retains prompt drafts across selection and inspector close', async () => {
  app = await launchAppWithWorkflow({
    format: 'rpgraph-workflow', formatVersion: '1.2', savedAt: '2026-09-07T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{ id: 'router', type: 'workflow', position: { x: 40, y: 60 }, data: {
      nodeType: 'llm-prompt-switch', nodeDataVersion: currentCoreNodeVersions['llm-prompt-switch'],
      label: 'Test router', description: '', preview: '',
      llmPromptSwitchOutputTitles: ['Story', 'Phone'],
      llmPromptSwitchPromptTitlesByOutput: [['Narration', 'Dialogue'], ['Message']],
      llmPromptSwitchPromptBeforesByOutput: [['Original prompt', 'Dialogue prompt'], ['Phone prompt']],
      llmPromptSwitchPromptAftersByOutput: [['', ''], ['']],
    } }, { id: 'target', type: 'workflow', position: { x: 800, y: 60 }, data: {
      nodeType: 'text-preview', nodeDataVersion: currentCoreNodeVersions['text-preview'],
      label: 'Destination', description: '', preview: '',
    } }],
    edges: [{ id: 'route-edge', source: 'router', sourceHandle: 'output-channel-0', target: 'target', targetHandle: null }],
  });
  const { page } = app;
  await enterGraphMode(page);
  const card = page.locator('.response-router-node');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Destination / Mixed Input', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test/results/response-router-before-editor.png' });
  await card.getByRole('button', { name: /Narration/ }).click();
  const editor = page.getByRole('dialog', { name: 'Response Router editor' });
  await expect(editor).toBeVisible();
  await expect(page.locator('.react-flow__edge[data-id="route-edge"]')).toHaveClass(/response-router-path/);
  await editor.locator('#router-before').fill('Draft preserved');
  await page.screenshot({ path: 'test/results/response-router-editor.png' });
  await expect(editor.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Close editor' }).click();
  await card.getByRole('button', { name: /Dialogue/ }).click();
  await editor.getByRole('button', { name: /Narration/ }).first().click();
  await expect(editor.locator('#router-before')).toHaveValue('Draft preserved');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Applied' })).toBeVisible();
  await editor.getByRole('button', { name: 'Undo Apply', exact: true }).click();
  await expect(editor.locator('#router-before')).toHaveValue('Original prompt');
  await editor.locator('#router-before').fill('Draft preserved');
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await editor.getByRole('button', { name: 'Close editor' }).click();
  await card.getByLabel('Output value').fill('1');
  await card.getByLabel('Prompt value').fill('0');
  await card.getByRole('button', { name: 'Check routing', exact: true }).click();
  await expect(card.getByRole('status').filter({ hasText: /Preview: Message/ })).toBeVisible();
  await page.screenshot({ path: 'test/results/response-router-desktop.png', fullPage: true });
  await card.getByRole('button', { name: /Narration/ }).click();
  await page.setViewportSize({ width: 650, height: 750 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(650);
  await expect(editor.locator('#router-before')).toBeVisible();
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test/results/response-router-narrow.png' });
});
