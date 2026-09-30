import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createAccountManager, type AccountManager } from './accountManager.cjs';
import { readLegacyAccountFiles, legacyDataAvailable } from './accountMigration.cjs';

const roots: string[] = [];
const managers: AccountManager[] = [];
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'rpgraph-migration-test-')); roots.push(root);
  const legacy = path.join(root, 'legacy'); await mkdir(legacy);
  const accounts = path.join(root, 'accounts');
  const manager = await createAccountManager({ root: accounts }); managers.push(manager);
  return { root, legacy, accounts, manager };
}

it('discovers actual legacy files, not empty folders, account vaults or linked outside data', async () => {
  const { root, legacy } = await setup();
  await mkdir(path.join(legacy, 'files', 'empty', 'nested'), { recursive: true });
  await mkdir(path.join(legacy, 'accounts'));
  await writeFile(path.join(legacy, 'accounts', 'private.record'), 'not legacy');
  expect(await legacyDataAvailable({ root: legacy })).toBe(false);
  await writeFile(path.join(legacy, 'files', 'empty', 'nested', 'kept.json'), '{"format":"rpgraph-encrypted-future"}');
  expect(await legacyDataAvailable({ root: legacy })).toBe(true);
  await rm(path.join(legacy, 'files', 'empty', 'nested', 'kept.json'));
  await writeFile(path.join(legacy, 'workflow-state.json'), '{}');
  expect(await legacyDataAvailable({ root: legacy })).toBe(true);
  await rm(path.join(legacy, 'workflow-state.json'));
  const external = path.join(root, 'outside'); await mkdir(external);
  await writeFile(path.join(external, 'private.json'), 'not in source');
  await symlink(external, path.join(legacy, 'characters'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(await legacyDataAvailable({ root: legacy })).toBe(false);
});

it('migrates allowlisted content/settings/preferences into an account without changing originals', async () => {
  const { legacy, accounts, manager } = await setup();
  await mkdir(path.join(legacy, 'files'));
  await writeFile(path.join(legacy, 'files', 'synthetic.json'), 'synthetic-private-content');
  await writeFile(path.join(legacy, 'settings.json'), '{"credential":"os-wrapped"}');
  await writeFile(path.join(legacy, 'ignored.txt'), 'not-owned');
  const account = await manager.importFiles({ alias: 'Migration fixture', password: 'fixture password', entries: readLegacyAccountFiles({
    root: legacy, preferences: { layout: 'synthetic' }, transformSettings: () => ({ credential: 'portable synthetic credential' }),
  }) });
  await manager.unlock(account.id, 'fixture password');
  const records = await manager.listRecords();
  const contents: Record<string, string> = {};
  for (const record of records) {
    const metadata = record.metadata as { relativePath: string; kind: string };
    if (metadata.kind === 'file') contents[metadata.relativePath] = (await manager.get(record.objectId, record.type)).toString();
  }
  expect(contents).toEqual({ 'files/synthetic.json': 'synthetic-private-content', 'settings.json': '{"credential":"portable synthetic credential"}', 'browser-preferences.json': '{"layout":"synthetic"}' });
  expect(await readFile(path.join(legacy, 'settings.json'), 'utf8')).toBe('{"credential":"os-wrapped"}');
  expect((await readdir(accounts)).some(name => name.startsWith('.pending-') || name.startsWith('.migration-view-'))).toBe(false);
});

it('rejects linked legacy directories and removes unpublished staging', async () => {
  const { root, legacy, accounts, manager } = await setup();
  await writeFile(path.join(legacy, 'settings.json'), '{}');
  const external = path.join(root, 'outside'); await mkdir(external);
  await writeFile(path.join(external, 'private.json'), 'outside');
  await symlink(external, path.join(legacy, 'files'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(manager.importFiles({ alias: 'Failed migration', entries: readLegacyAccountFiles({ root: legacy }) })).rejects.toThrow('Linked legacy paths');
  expect(await manager.listAccounts()).toHaveLength(1);
  expect((await readdir(accounts)).some(name => name.startsWith('.pending-'))).toBe(false);
  expect(await readFile(path.join(external, 'private.json'), 'utf8')).toBe('outside');
});

it('rolls back a cancelled migration after an entry was staged', async () => {
  const { accounts, manager } = await setup();
  let entered: () => void = () => {};
  const staged = new Promise<void>(resolve => { entered = resolve; });
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  async function* entries() {
    yield { relativePath: 'settings.json', kind: 'file' as const, data: Buffer.from('{}') };
    entered(); await held;
    yield { relativePath: 'workflow-state.json', kind: 'file' as const, data: Buffer.from('{}') };
  }
  const importing = manager.importFiles({ alias: 'Cancelled migration', entries: entries() });
  await staged;
  const locking = manager.lock(); release();
  await expect(importing).rejects.toThrow(); await locking;
  expect(await manager.listAccounts()).toHaveLength(1);
  expect((await readdir(accounts)).some(name => name.startsWith('.pending-'))).toBe(false);
});

it('requires a fresh review after migration and archive import, overriding an imported approval', async () => {
  const { root, manager } = await setup();
  async function* entries() {
    yield { relativePath: 'account-import-review.json', kind: 'file' as const, data: Buffer.from('{"pending":false}') };
  }
  const first = await manager.importFiles({ alias: 'Review fixture', entries: entries(), requireReview: true });
  await manager.unlock(first.id);
  let records = await manager.listRecords();
  expect(records).toHaveLength(1);
  expect((await manager.get(records[0].objectId, 'account-file')).toString()).toBe('{"pending":true}');
  const approved = Buffer.from('{"pending":false}');
  await manager.put({ ...records[0], metadata: { ...(records[0].metadata as object), size: approved.length }, data: approved });
  const destination = path.join(root, 'review.zip');
  await manager.exportAccount(destination); await manager.lock();
  const second = await manager.importAccount({ source: destination, alias: 'Imported review fixture', protection: 'open', requireReview: true });
  await manager.unlock(second.id);
  records = await manager.listRecords();
  expect(records).toHaveLength(1);
  expect((await manager.get(records[0].objectId, 'account-file')).toString()).toBe('{"pending":true}');
});

it('does not trust imported offline fallback records when requiring provider review', async () => {
  const { root, manager } = await setup();
  const reserved = ['offline-settings.json', 'offline-browser-preferences.json', 'offline-comfy-model-state.json'];
  async function* entries() {
    for (const relativePath of reserved) yield { relativePath, kind: 'file' as const, data: Buffer.from('{"endpoint":"https://synthetic.invalid"}') };
  }
  // A previous application version or a crafted export can contain these paths.
  const source = await manager.importFiles({ alias: 'Fallback source', entries: entries() });
  await manager.unlock(source.id);
  const destination = path.join(root, 'fallback.zip');
  await manager.exportAccount(destination); await manager.lock();
  const imported = await manager.importAccount({ source: destination, alias: 'Fallback destination', protection: 'open', requireReview: true });
  await manager.unlock(imported.id);
  expect((await manager.listRecords()).map(record => (record.metadata as { relativePath: string }).relativePath)).toEqual(['account-import-review.json']);
  await manager.lock();
  const migrated = await manager.importFiles({ alias: 'Fallback migration', entries: entries(), requireReview: true });
  await manager.unlock(migrated.id);
  expect((await manager.listRecords()).map(record => (record.metadata as { relativePath: string }).relativePath)).toEqual(['account-import-review.json']);
});
