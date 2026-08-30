import { expect, test, type Page } from '@playwright/test';
import {
  cleanup,
  enterGraphMode,
  enterPlayMode,
  launchAppWithWorkflow,
  outdatedLlmWorkflow,
  type LaunchedApp,
} from './helpers';

let app: LaunchedApp | undefined;

test.afterEach(async () => {
  await cleanup(app);
  app = undefined;
});

async function graphCanvasVisible(page: Page) {
  await expect(page.locator('.react-flow').first()).toBeVisible();
}

test('starts in Play Mode and preserves access to the full graph editor', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await expect(page.getByRole('button', { name: /Graph Mode/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /Story surfaces/i })).toBeVisible();
  await expect(page.getByRole('tablist', { name: /Chat views/i })).toBeVisible();

  await enterGraphMode(page);

  await expect(page.getByRole('button', { name: /Play Mode/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /Workflow Graph/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Available nodes/i })).toBeVisible();
  await graphCanvasVisible(page);

  await enterPlayMode(page);

  await expect(page.getByRole('navigation', { name: /Story surfaces/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Chat/i })).toBeVisible();
});

test('keeps Phone and Events reachable from Play Mode', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await page.getByRole('tab', { name: /Phone/i }).click({ force: true });
  await expect(page.getByRole('tab', { name: /Phone/i })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: /Events/i }).click({ force: true });
  await expect(page.getByRole('tab', { name: /Events/i })).toHaveAttribute('aria-selected', 'true');
});
