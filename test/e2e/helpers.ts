import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { currentCoreNodeVersions } from '../../src/nodes/nodeVersion';
import { bundledDefaultWorkflowFileNames } from '../../electron/workflowDefaults.cjs';
import type { AppSettings } from '../../src/types';

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultWorkflowsDirectory = path.join(repoRoot, 'default_workflows');

export type WorkflowFixture = {
  format: 'rpgraph-workflow';
  formatVersion: '1.2';
  savedAt: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: Array<Record<string, unknown>>;
  edges: unknown[];
};

export type LaunchedApp = {
  electronApp: ElectronApplication;
  page: Page;
  profile: string;
};

// Mirror electron/main.cjs bundledDefaultWorkflowPath(): the app copies this default
// into the profile's files/ store on startup UNLESS workflow-state.json's
// importedDefaultFileName already equals its basename. We seed that field so the copy
// is skipped (otherwise it clobbers lastWorkflowFileName and the default loads instead
// of our fixture).
function bundledDefaultBasename(): string {
  const names = bundledDefaultWorkflowFileNames(fs.readdirSync(defaultWorkflowsDirectory));
  if (names.length === 0) {
    throw new Error('No workflow.default*.json found in default_workflows/.');
  }
  return names[names.length - 1];
}

/**
 * Launch the real Electron app in a fresh throwaway profile, pre-seeded (before launch,
 * so there is no race) with `workflow` as the startup workflow. Dismisses the welcome
 * dialog. The caller must `cleanup()` in afterEach.
 */
export async function launchAppWithWorkflow(workflow: WorkflowFixture, settings?: AppSettings): Promise<LaunchedApp> {
  const distIndex = path.join(repoRoot, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error('dist/index.html is missing — run "npm run build" before the e2e suite.');
  }

  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'rpgraph-e2e-'));
  if (settings) await fsp.writeFile(path.join(profile, 'settings.json'), JSON.stringify(settings), 'utf8');
  await fsp.mkdir(path.join(profile, 'files'), { recursive: true });
  await fsp.writeFile(
    path.join(profile, 'files', 'fixture.json'),
    JSON.stringify(workflow, null, 2),
    'utf8',
  );
  await fsp.writeFile(
    path.join(profile, 'workflow-state.json'),
    JSON.stringify(
      { lastWorkflowFileName: 'fixture.json', importedDefaultFileName: bundledDefaultBasename() },
      null,
      2,
    ),
    'utf8',
  );
  // A fresh --user-data-dir has no window-state.json yet, and the app's own
  // loadWindowState() fallback for that case is `isMaximized: true` (a reasonable default
  // for a genuine first-time user, not something to change) — so every e2e run would
  // otherwise briefly flash full-screen before the post-launch resize below ever runs.
  // Seed a small, non-maximized state so the window is created at this size from the start.
  await fsp.writeFile(
    path.join(profile, 'window-state.json'),
    JSON.stringify(
      { bounds: { x: 0, y: 0, width: 1024, height: 700 }, isMaximized: false, isFullScreen: false },
      null,
      2,
    ),
    'utf8',
  );

  // Never run Electron as plain Node.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronApp = await _electron.launch({
    args: [repoRoot, `--user-data-dir=${profile}`, '--no-sandbox'],
    cwd: repoRoot,
    env,
  });
  const page = await electronApp.firstWindow();
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.setBackgroundThrottling(false);
      // Defensive belt-and-suspenders on top of the seeded window-state.json above, in
      // case anything ever calls maximize()/setFullScreen() before this runs.
      if (window.isMaximized()) {
        window.unmaximize();
      }
      if (window.isFullScreen()) {
        window.setFullScreen(false);
      }
      window.setBounds({ x: 0, y: 0, width: 1024, height: 700 });
      // Tests can reach DOM controls before ready-to-show delivers the first
      // paint. A visible window is required for Playwright's frame-based checks, but
      // it doesn't need OS focus — showInactive() avoids stealing the foreground.
      window.showInactive();
    }
  });

  // The app reads app-data directly from the passed --user-data-dir (it never calls
  // app.setPath), so our seed dir must equal getPath('userData'). Surface a wrong path
  // immediately rather than as a mysterious "node never appears" timeout.
  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  if (path.relative(profile, userDataPath) !== '') {
    throw new Error(
      `Seed mismatch: userData is "${userDataPath}" but the fixture was seeded under "${profile}".`,
    );
  }

  await dismissWelcomeIfPresent(page);
  return { electronApp, page, profile };
}

async function dismissWelcomeIfPresent(page: Page) {
  const welcome = page.locator('.welcome-dialog, .welcome-dialog-backdrop').first();
  try {
    await welcome.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return; // no welcome dialog this run
  }
  await page.keyboard.press('Escape');
  try {
    await welcome.waitFor({ state: 'hidden', timeout: 3_000 });
    return;
  } catch {
    // fall through to the explicit close button
  }
  const closeButton = page.locator('button.welcome-close-x');
  if (await closeButton.count()) {
    await closeButton.first().click();
    await welcome.waitFor({ state: 'hidden', timeout: 3_000 });
  }
}

export async function cleanup(app: LaunchedApp | undefined) {
  if (!app) {
    return;
  }
  try {
    // close() triggers main's ~8s window:cleanup-before-close handshake.
    await app.electronApp.close();
  } finally {
    await fsp.rm(app.profile, { recursive: true, force: true });
  }
}

export async function enterGraphMode(page: Page) {
  await page.getByRole('button', { name: /Open main menu/i }).click({ force: true });
  const graphModeButton = page.getByRole('menuitem', { name: /Graph Mode/i });
  await graphModeButton.click({ force: true });
  await page.getByRole('region', { name: /Workflow Graph/i }).waitFor({ state: 'visible' });
  await page.locator('.react-flow__node').first().waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Fit View' }).click({ force: true });
}

export async function enterPlayMode(page: Page) {
  await page.getByRole('button', { name: /Open main menu/i }).click({ force: true });
  const playModeButton = page.getByRole('menuitem', { name: /Play Mode/i });
  await playModeButton.click({ force: true });
  await page.getByRole('navigation', { name: /Story surfaces/i }).waitFor({ state: 'visible' });
}

function workflowEnvelope(nodes: Array<Record<string, unknown>>): WorkflowFixture {
  return {
    format: 'rpgraph-workflow',
    formatVersion: '1.2',
    savedAt: '2026-07-15T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges: [],
  };
}

/**
 * One outdated `llm-prompt` node (major-incompatible with the current 1.2.0) carrying a
 * large saved size — it should render as an incompatible card at ~300px (dims stripped),
 * with `llmPromptBefore` preserved for the upgrade.
 */
export function outdatedLlmWorkflow(): WorkflowFixture {
  return workflowEnvelope([
    {
      id: 'outdated-llm-prompt-1',
      type: 'workflow',
      position: { x: 80, y: 80 },
      style: { width: 900, height: 1200 },
      width: 900,
      height: 1200,
      measured: { width: 900, height: 1200 },
      data: {
        nodeType: 'llm-prompt',
        nodeDataVersion: '0.9.0',
        label: 'LLM Prompt',
        description: 'Outdated node',
        preview: 'Not run yet',
        llmPromptBefore: 'CARRIED OVER PROMPT TEXT',
      },
    },
  ]);
}

function overrideEdge(id: string, source: string, targetHandle: string): Record<string, unknown> {
  return { id, source, sourceHandle: null, target: 'llm-under-test', targetHandle };
}

/**
 * A live `llm-prompt` node with authored before/after text, optionally pre-connected to a
 * single text source (`last-rp-output`) on its `prompt-before` and/or `prompt-after`
 * override handles. A connected handle should mark that field overridden in the card while
 * leaving the authored text untouched; edge validation is shape-only, so a seeded override
 * edge loads and drives the badge without needing a live provider.
 */
export function llmPromptOverrideWorkflow(
  options: { before?: boolean; after?: boolean } = {},
): WorkflowFixture {
  const nodes: Array<Record<string, unknown>> = [
    {
      id: 'llm-under-test',
      type: 'workflow',
      position: { x: 420, y: 40 },
      data: {
        nodeType: 'llm-prompt',
        nodeDataVersion: currentCoreNodeVersions['llm-prompt'],
        label: 'LLM Prompt',
        description: 'LLM provider call',
        preview: 'Not run yet',
        llmPromptBefore: 'AUTHORED BEFORE TEXT',
        llmPromptAfter: 'AUTHORED AFTER TEXT',
        llmPromptAutoFormatJson: false,
        llmPromptActions: [],
        llmPromptCommands: [],
        runAfterRpOutput: false,
      },
    },
  ];
  const edges: Array<Record<string, unknown>> = [];
  if (options.before || options.after) {
    nodes.push({
      id: 'override-source',
      type: 'workflow',
      position: { x: 40, y: 40 },
      data: {
        nodeType: 'last-rp-output',
        nodeDataVersion: currentCoreNodeVersions['last-rp-output'],
        label: 'Last RP Output',
        description: 'Latest RP output',
        preview: 'Not run yet',
      },
    });
    if (options.before) {
      edges.push(overrideEdge('edge-before', 'override-source', 'prompt-before'));
    }
    if (options.after) {
      edges.push(overrideEdge('edge-after', 'override-source', 'prompt-after'));
    }
  }
  return {
    format: 'rpgraph-workflow',
    formatVersion: '1.2',
    savedAt: '2026-07-16T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

/**
 * An incompatible `input` (a singleton) plus a live `input`. Loads fine (singletons are
 * only guarded at add-time; the incompatible placeholder isn't counted), but upgrading
 * the incompatible one must be blocked by the uniqueness guard.
 */
export function singletonConflictWorkflow(): WorkflowFixture {
  return workflowEnvelope([
    {
      id: 'outdated-input-1',
      type: 'workflow',
      position: { x: 80, y: 80 },
      data: {
        nodeType: 'input',
        nodeDataVersion: '0.0.1',
        label: 'User Input',
        description: 'Outdated input',
        preview: 'Waiting for input ...',
      },
    },
    {
      id: 'live-input-1',
      type: 'workflow',
      position: { x: 80, y: 440 },
      data: {
        nodeType: 'input',
        nodeDataVersion: currentCoreNodeVersions.input,
        label: 'User Input',
        description: 'Chat message',
        preview: 'Waiting for input ...',
      },
    },
  ]);
}
