import { expect, test, type Page } from '@playwright/test';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { rpStorybookJsonText, starterRpStorybook } from '../../src/nodes/rp-storybook/model';
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

function storybookEditorWorkflow() {
  return {
    format: 'rpgraph-workflow' as const,
    formatVersion: '1.2' as const,
    savedAt: '2026-08-30T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    edges: [],
    nodes: [
      {
        id: 'storybook-editor-under-test',
        type: 'workflow',
        position: { x: 80, y: 80 },
        data: {
          nodeType: 'rp-storybook-editor',
          nodeDataVersion: currentCoreNodeVersions['rp-storybook-editor'],
          label: 'RP Storybook Editor',
          description: 'Edit storybook text and JSON',
          preview: 'Starter story',
          storybookJson: rpStorybookJsonText(starterRpStorybook),
          storybookStatus: 'Ready',
        },
      },
    ],
  };
}

function rpStorybookWorkflow() {
  return {
    format: 'rpgraph-workflow' as const,
    formatVersion: '1.2' as const,
    savedAt: '2026-08-30T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    edges: [],
    nodes: [
      {
        id: 'rp-storybook-under-test',
        type: 'workflow',
        position: { x: 80, y: 80 },
        data: {
          nodeType: 'rp-storybook',
          nodeDataVersion: currentCoreNodeVersions['rp-storybook'],
          label: 'RP Storybook V2',
          description: 'Complete roleplay storybook',
          preview: 'Starter story',
          storybookJson: rpStorybookJsonText(starterRpStorybook),
          storybookStatus: 'Ready',
        },
      },
    ],
  };
}

test('starts in Play Mode and preserves access to the full graph editor', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await expect(page.getByRole('button', { name: /Graph Mode/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /Story surfaces/i })).toBeVisible();
  await expect(page.getByRole('tablist', { name: /Playable characters/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Story State/i })).toBeVisible();

  await enterGraphMode(page);

  await expect(page.getByRole('button', { name: /Play Mode/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /Workflow Graph/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Available nodes/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Node Inspector/i })).toBeVisible();
  await graphCanvasVisible(page);

  await enterPlayMode(page);

  await expect(page.getByRole('navigation', { name: /Story surfaces/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
});

test('collapses Story State without hiding turn controls', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await page.getByRole('button', { name: /Collapse Story State/i }).click({ force: true });

  await expect(page.getByText('Character-owned surfaces')).toBeHidden();
  await expect(page.getByRole('button', { name: /AutoTurn/i })).toBeVisible();
  await expect(page.getByText(/Turn 0/i)).toBeVisible();
});

test('switches Play Mode themes from the header selector', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await page.getByLabel(/Theme/i).selectOption('goth');
  await expect(page.locator('.studio')).toHaveAttribute('data-studio-theme', 'goth');

  await page.getByLabel(/Theme/i).selectOption('cute-girly');
  await expect(page.locator('.studio')).toHaveAttribute('data-studio-theme', 'cute-girly');
});

test('keeps Phone and Events reachable from Play Mode', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await page.getByRole('button', { name: /Phone/i }).click({ force: true });
  await expect(page.getByRole('button', { name: /Phone/i })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Gallery', exact: true }).click({ force: true });
  await expect(page.getByLabel(/Gallery/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Social', exact: true }).click({ force: true });
  await expect(page.getByLabel(/Fotogram/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Bank', exact: true }).click({ force: true });
  await expect(page.getByLabel(/Banking/i).first()).toBeVisible();

  await page.getByRole('button', { name: 'Notes', exact: true }).click({ force: true });
  await expect(page.getByLabel(/Notes/i).first()).toBeVisible();

  await page.getByRole('button', { name: /Events/i }).click({ force: true });
  await expect(page.getByRole('button', { name: /Events/i })).toHaveAttribute('aria-current', 'page');
});

test('keeps the Add Nodes sidebar open and anchored on the left in Graph Mode', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await enterGraphMode(page);

  const palette = page.getByRole('complementary', { name: /Available nodes/i });
  await expect(palette).toBeVisible();

  const box = await palette.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeLessThan(40);
  expect(box?.width).toBeGreaterThan(240);

  await page.mouse.move((box?.x ?? 0) + 120, (box?.y ?? 0) + 220);
  await expect(palette).toBeVisible();

  const afterHoverBox = await palette.boundingBox();
  expect(afterHoverBox?.x).toBeLessThan(40);
  expect(afterHoverBox?.width).toBeGreaterThan(240);

  const canvasBox = await page.getByRole('region', { name: /Workflow Graph/i }).boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox?.x).toBeGreaterThan((afterHoverBox?.x ?? 0) + (afterHoverBox?.width ?? 0) - 1);
});

test('filters Add Nodes from the persistent palette search', async () => {
  app = await launchAppWithWorkflow(outdatedLlmWorkflow());
  const { page } = app;

  await enterGraphMode(page);
  await page.getByRole('searchbox', { name: /Search nodes/i }).fill('preview');

  await expect(page.getByText('Text Preview')).toBeVisible();
  await expect(page.getByText('User Input', { exact: true })).toBeHidden();
});

test('opens the Storybook Editor as a workbench with assistant and clear editing zones', async () => {
  app = await launchAppWithWorkflow(storybookEditorWorkflow());
  const { page } = app;

  await enterGraphMode(page);
  await page.getByRole('button', { name: /Open Editor/i }).click({ force: true });

  await expect(page.getByRole('dialog', { name: /RP Storybook Editor/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /Storybook sections/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /Focused storybook editor/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Storybook assistant/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Title/i })).toBeVisible();
  await expect(page.getByText(/Read-only fields are shown in the side panel/i)).toBeVisible();

  await page.getByRole('button', { name: /Raw JSON/i }).click({ force: true });
  await expect(page.getByText(/Advanced JSON Editor/i)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Storybook raw JSON/i })).toBeVisible();
});

test('opens Edit Storybook on the RP Storybook node as the same workbench contract', async () => {
  app = await launchAppWithWorkflow(rpStorybookWorkflow());
  const { page } = app;

  await enterGraphMode(page);
  await page.getByRole('button', { name: /Edit Storybook/i }).click({ force: true });

  await expect(page.getByRole('dialog', { name: /RP Storybook Creator/i })).toBeVisible();
  await expect(page.getByRole('navigation', { name: /Storybook sections/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /Focused storybook editor/i })).toBeVisible();
  await expect(page.getByRole('complementary', { name: /Storybook assistant/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Scenario/i })).toBeVisible();
  await expect(page.getByText(/Editable fields are marked cyan/i)).toBeVisible();
});
