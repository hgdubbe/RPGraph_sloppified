import { _electron, expect, test, type Page } from '@playwright/test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const accountRequire = createRequire(path.join(__dirname, 'accounts.spec.ts'));
const { createAccountManager } = accountRequire('../../../electron/accounts/accountManager.cjs');

function desktopLaunchOptions(root: string, profile: string, env: NodeJS.ProcessEnv) {
  const executablePath = process.env.RPGRAPH_E2E_EXECUTABLE;
  return { ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : [root]), `--user-data-dir=${profile}`, '--no-sandbox'], cwd: root, env };
}

test('legacy notice clears after cleanup even when empty nested folders remain', async () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const profile = await mkdtemp(path.join(tmpdir(), 'rpgraph-empty-legacy-e2e-'));
  await mkdir(path.join(profile, 'files', 'empty', 'nested'), { recursive: true });
  await writeFile(path.join(profile, 'files', 'plain.json'), '{"synthetic":true}');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch(desktopLaunchOptions(root, profile, env));
  try {
    const login = await app.firstWindow();
    await expect(login.getByText('Existing local data found', { exact: true })).toBeVisible();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async (...args: unknown[]) => {
        const options = args.at(-1) as Electron.MessageBoxOptions;
        if (options.title === 'Import existing local data?') return { response: 1, checkboxChecked: false };
        if (options.title === 'Existing data imported') return { response: 2, checkboxChecked: false };
        if (options.title === 'Confirm deletion of originals') return { response: 1, checkboxChecked: true };
        return { response: 0, checkboxChecked: false };
      };
    });
    await login.getByRole('button', { name: 'Import existing data', exact: true }).click();
    await login.getByLabel('Public account name').fill('Synthetic empty cleanup');
    await login.getByLabel('New account password', { exact: true }).fill('fixture cleanup passphrase');
    await login.getByLabel('Confirm password', { exact: true }).fill('fixture cleanup passphrase');
    await login.getByRole('button', { name: 'Import into new account', exact: true }).click();
    await expect(login.getByText('Account ready. Choose Enter to continue.', { exact: true })).toBeVisible();
    expect((await login.evaluate(() => window.rpgraph.accounts!.status())).legacyAvailable).toBe(false);
    await expect(login.getByText('Existing local data found', { exact: true })).toHaveCount(0);
    // Restarting the renderer must not rediscover empty folders as private data.
    await login.reload();
    await expect(login.getByRole('heading', { name: 'Your stories, your space.' })).toBeVisible();
    await expect(login.getByText('Existing local data found', { exact: true })).toHaveCount(0);
    expect(await readdir(path.join(profile, 'files', 'empty', 'nested'))).toEqual([]);
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('legacy cleanup requires reviewed consent and preserves encrypted and changed originals', async () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const profile = await mkdtemp(path.join(tmpdir(), 'rpgraph-cleanup-e2e-'));
  await mkdir(path.join(profile, 'files'));
  await writeFile(path.join(profile, 'files', 'plain.json'), '{"synthetic":"imported original"}');
  await writeFile(path.join(profile, 'files', 'protected.json'), '{"format":"rpgraph-encrypted-future","synthetic":true}');
  await writeFile(path.join(profile, 'unrelated.txt'), 'synthetic unrelated');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch(desktopLaunchOptions(root, profile, env));
  let accountId = '';
  try {
    const login = await app.firstWindow();
    await expect(login.getByRole('heading', { name: 'Your stories, your space.' })).toBeVisible();
    await app.evaluate(async ({ BrowserWindow, session, dialog, shell }, index) => {
      const probe = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true } });
      await probe.loadFile(index);
      await probe.webContents.executeJavaScript('localStorage.setItem("synthetic.original", "PRIVATE_PREFERENCE_CANARY"); localStorage.setItem("synthetic.changed", "old");');
      const state = { dialogs: [] as Electron.MessageBoxOptions[], folders: [] as string[], reviewed: false, probe };
      (globalThis as unknown as { cleanupTest: typeof state }).cleanupTest = state;
      dialog.showMessageBox = async (...args: unknown[]) => {
        const options = args.at(-1) as Electron.MessageBoxOptions;
        state.dialogs.push(options);
        if (options.title === 'Import existing local data?') return { response: 1, checkboxChecked: false };
        if (options.title === 'Existing data imported') {
          const response = state.reviewed ? 2 : 1; state.reviewed = true;
          return { response, checkboxChecked: false };
        }
        if (options.title === 'Review deletion list') return { response: 0, checkboxChecked: false };
        if (options.title === 'Confirm deletion of originals') {
          await probe.webContents.executeJavaScript('localStorage.setItem("synthetic.changed", "new");');
          return { response: 1, checkboxChecked: true };
        }
        if (options.title === 'Check for remaining data') return { response: 1, checkboxChecked: false };
        throw new Error(`Unexpected dialog: ${options.title}`);
      };
      shell.openPath = async folder => { state.folders.push(folder); return ''; };
    }, path.join(root, 'dist', 'index.html'));
    const account = await login.evaluate(() => window.rpgraph.accounts!.migrate({ alias: 'Synthetic cleanup', password: 'cleanup fixture passphrase' }));
    expect(account?.id).toBeTruthy(); accountId = account!.id;
    const result = await app.evaluate(async () => {
      const state = (globalThis as unknown as { cleanupTest: { dialogs: Electron.MessageBoxOptions[]; folders: string[]; probe: Electron.BrowserWindow } }).cleanupTest;
      const preferences = await state.probe.webContents.executeJavaScript('Object.fromEntries(Object.entries(localStorage))');
      state.probe.destroy();
      return { dialogs: state.dialogs, folders: state.folders, preferences };
    });
    const preview = result.dialogs.find(item => item.title === 'Review deletion list')!;
    expect(preview.detail).toContain('files/plain.json');
    expect(preview.detail).toContain('synthetic.original');
    expect(preview.detail).not.toContain('PRIVATE_PREFERENCE_CANARY');
    expect(preview.detail).not.toContain('files/protected.json');
    const confirmation = result.dialogs.find(item => item.title === 'Confirm deletion of originals')!;
    expect(confirmation.checkboxChecked).toBe(false);
    expect(confirmation.defaultId).toBe(0);
    expect(confirmation.detail).toContain('only be accessible through account');
    expect(result.dialogs.at(-1)?.message).toContain('incomplete');
    expect(result.folders).toEqual([profile]);
    expect(result.preferences).not.toHaveProperty(['synthetic.original']);
    expect(result.preferences).toHaveProperty(['synthetic.changed'], 'new');
    await expect(readFile(path.join(profile, 'files', 'plain.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(profile, 'files', 'protected.json'), 'utf8')).toContain('rpgraph-encrypted-future');
    expect(await readFile(path.join(profile, 'unrelated.txt'), 'utf8')).toBe('synthetic unrelated');
  } finally {
    await app.close();
    try {
      if (accountId) {
        const manager = await createAccountManager({ root: path.join(profile, 'accounts') });
        try {
          await manager.unlock(accountId, 'cleanup fixture passphrase');
          const records = await manager.listRecords();
          for (const [relativePath, expected] of [['files/plain.json', 'imported original'], ['browser-preferences.json', 'PRIVATE_PREFERENCE_CANARY']]) {
            const record = records.find((item: { metadata: { relativePath?: string } }) => item.metadata.relativePath === relativePath);
            expect(record).toBeTruthy();
            expect((await manager.get(record.objectId, record.type)).toString()).toContain(expected);
          }
        } finally { await manager.dispose(); }
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
});

test('desktop gates legacy data, encrypts account saves, and isolates a second login', async () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const profile = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-e2e-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const canary = 'SYNTHETIC_ACCOUNT_PRIVATE_CANARY_81721';
  await mkdir(path.join(profile, 'files'));
  await writeFile(path.join(profile, 'files', 'legacy-private.json'), '{"synthetic":"legacy never consented"}');
  const app = await _electron.launch(desktopLaunchOptions(root, profile, env));
  try {
    expect(path.resolve(await app.evaluate(({ app }) => app.getPath('userData')))).toBe(path.resolve(profile));
    let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Your stories, your space.' })).toBeVisible();
    await expect(page.locator('img.account-illustration')).toBeVisible();
    await expect.poll(() => page.locator('img.account-illustration').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.react-flow')).toHaveCount(0);
    const locked = await page.evaluate(async () => {
      try { await window.rpgraph.loadSettings(); return false; } catch { return true; }
    });
    expect(locked).toBe(true);
    const account = await page.evaluate(() => window.rpgraph.accounts!.create({ alias: 'Synthetic private', password: 'synthetic strong passphrase' }));
    async function changeWindow(current: Page, task: () => Promise<unknown>) {
      const next = app.waitForEvent('window');
      await task().catch(() => {}); // Host destroys the old renderer after transition.
      const result = await next;
      await result.waitForLoadState('domcontentloaded');
      expect(current.isClosed()).toBe(true);
      return result;
    }
    page = await changeWindow(page, () => page.evaluate(id => window.rpgraph.accounts!.unlock({ id, password: 'synthetic strong passphrase' }), account.id));
    await expect(page.getByRole('button', { name: 'Open main menu' })).toBeVisible();
    await expect(page.locator('.account-workspace-button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close onboarding guide' }).click();
    await page.getByRole('dialog', { name: 'Restore previous workspace' }).getByRole('button', { name: 'Start Fresh' }).click();
    await page.getByRole('button', { name: 'Open main menu' }).click();
    await expect(page.getByRole('menuitem').last()).toHaveText('Account');
    await page.getByRole('menuitem', { name: 'Account', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Account', exact: true })).toBeVisible();
    await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: 'Backup', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export account (encrypted)', exact: true })).toBeVisible();
    await expect(page.getByRole('menu', { name: 'Main menu' })).toHaveCount(0);
    await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Open main menu' }).click();
    await page.getByRole('menuitem', { name: 'Providers', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Providers' }).locator('.options-sidebar')).toBeVisible();
    await page.getByRole('dialog', { name: 'Providers' }).getByRole('button', { name: '+ New', exact: true }).click();
    await expect(page.getByText('Pick a provider type', { exact: true })).toBeVisible();
    await page.getByRole('dialog', { name: 'Providers' }).getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(value => window.rpgraph.accounts!.savePreferences({ 'synthetic.canary': value }), canary);
    await page.evaluate(() => window.rpgraph.saveSession('Synthetic save', { synthetic: 'fixture' } as never, 'plain', ''));
    page = await changeWindow(page, () => page.evaluate(() => window.rpgraph.accounts!.lock()));
    await expect(page.getByRole('heading', { name: 'Your stories, your space.' })).toBeVisible();
    for (const name of await readdir(path.join(profile, 'accounts'), { recursive: true })) {
      const file = path.join(profile, 'accounts', name);
      try { expect((await readFile(file)).includes(Buffer.from(canary))).toBe(false); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EISDIR' && (error as NodeJS.ErrnoException).code !== 'EPERM') throw error; }
    }
    const open = await page.evaluate(() => window.rpgraph.accounts!.create({ alias: 'Synthetic open' }));
    page = await changeWindow(page, () => page.evaluate(id => window.rpgraph.accounts!.unlock({ id }), open.id));
    await expect(page.getByRole('button', { name: 'Open main menu' })).toBeVisible();
    expect(await page.evaluate(() => window.rpgraph.accounts!.loadPreferences())).not.toHaveProperty(['synthetic.canary']);
    expect((await page.evaluate(() => window.rpgraph.listFiles())).some(file => file.fileName === 'legacy-private.json' || file.fileName === 'Synthetic save.json')).toBe(false);
    page = await changeWindow(page, () => page.evaluate(() => window.rpgraph.accounts!.lock()));
    await page.screenshot({ path: path.join(root, 'test', 'results', 'account-login.png') });
    page = await changeWindow(page, () => page.evaluate(id => window.rpgraph.accounts!.unlock({ id, password: 'synthetic strong passphrase' }), account.id));
    await expect(page.getByRole('button', { name: 'Open main menu' })).toBeVisible();
    expect(await page.evaluate(() => window.rpgraph.accounts!.loadPreferences())).toHaveProperty(['synthetic.canary'], canary);
    const backup = path.join(profile, 'synthetic-backup.zip');
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, backup);
    expect(await page.evaluate(() => window.rpgraph.accounts!.export())).toBe(true);
    expect((await readFile(backup)).includes(Buffer.from(canary))).toBe(false);
    page = await changeWindow(page, () => page.evaluate(() => window.rpgraph.accounts!.lock()));
    const imported = await page.evaluate(() => window.rpgraph.accounts!.import({ alias: 'Synthetic restored', protection: 'password',
      password: 'new fixture passphrase', archivePassword: 'synthetic strong passphrase' }));
    expect(imported?.id).not.toBe(account.id);
    page = await changeWindow(page, () => page.evaluate(id => window.rpgraph.accounts!.unlock({ id, password: 'new fixture passphrase' }), imported!.id));
    await expect(page.getByRole('button', { name: 'Open main menu' })).toBeVisible();
    expect(await page.evaluate(() => window.rpgraph.accounts!.loadPreferences())).toHaveProperty(['synthetic.canary'], canary);
    expect(await readFile(path.join(profile, 'files', 'legacy-private.json'), 'utf8')).toContain('legacy never consented');
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('declining imported providers isolates settings, browser preferences and pending model state', async () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const profile = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-e2e-'));
  const manager = await createAccountManager({ root: path.join(profile, 'accounts') });
  const account = await manager.importFiles({ alias: 'Synthetic imported', password: 'fixture passphrase', requireReview: true,
    entries: (async function* () {
      yield { relativePath: 'settings.json', kind: 'file', data: Buffer.from(JSON.stringify({ connections: [{ label: 'Synthetic imported provider', baseUrl: 'http://127.0.0.1:19876' }], options: {} })) };
      yield { relativePath: 'browser-preferences.json', kind: 'file', data: Buffer.from(JSON.stringify({ 'rpgraph.connections': 'synthetic imported endpoint', 'rpgraph-autoplay-enabled': 'true' })) };
      yield { relativePath: 'comfy-model-state.json', kind: 'file', data: Buffer.from('{"pendingFreeBaseUrl":"http://127.0.0.1:19876"}') };
      yield { relativePath: 'offline-settings.json', kind: 'file', data: Buffer.from(JSON.stringify({ connections: [{ label: 'Forged fallback', baseUrl: 'http://127.0.0.1:19876' }], options: {} })) };
      yield { relativePath: 'offline-browser-preferences.json', kind: 'file', data: Buffer.from(JSON.stringify({ 'rpgraph.connections': 'forged fallback endpoint', 'rpgraph-autoplay-enabled': 'true' })) };
      yield { relativePath: 'offline-comfy-model-state.json', kind: 'file', data: Buffer.from('{"pendingFreeBaseUrl":"http://127.0.0.1:19876"}') };
    })() });
  await manager.dispose();
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch(desktopLaunchOptions(root, profile, env));
  try {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const login = await app.firstWindow();
    await expect(login.getByRole('heading', { name: 'Your stories, your space.' })).toBeVisible();
    const next = app.waitForEvent('window');
    await login.evaluate(id => window.rpgraph.accounts!.unlock({ id, password: 'fixture passphrase' }), account.id).catch(() => {});
    const page = await next;
    await expect(page.getByRole('button', { name: 'Open main menu' })).toBeVisible();
    const preferences = await page.evaluate(() => window.rpgraph.accounts!.loadPreferences());
    expect(preferences).not.toHaveProperty(['rpgraph.connections']);
    expect(preferences).not.toHaveProperty('rpgraph-autoplay-enabled', 'true');
    expect(JSON.stringify(await page.evaluate(() => window.rpgraph.loadSettings()))).not.toContain('19876');
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
