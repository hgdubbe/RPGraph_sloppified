import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createAccountManager as createManager, type AccountManager } from './accountManager.cjs';
import { decryptRecord } from './accountCrypto.cjs';

const roots: string[] = [];
const managers: AccountManager[] = [];
async function createAccountManager(options: { root: string }) {
  const manager = await createManager(options);
  managers.push(manager);
  return manager;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const manager of managers.splice(0)) await manager.dispose?.();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('removes unpublished account data when profile publication fails', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const root = path.join(parent, 'accounts');
  const manager = await createAccountManager({ root });
  const rename = fs.rename.bind(fs);
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
    if (typeof source === 'string' && path.basename(source).startsWith('.pending-') &&
        typeof destination === 'string' && path.dirname(destination) === root) {
      throw new Error('synthetic publication failure');
    }
    return rename(source, destination);
  });
  await expect(manager.create({ alias: 'Unpublished fixture' })).rejects.toThrow('synthetic publication failure');
  fault.mockRestore();
  expect((await readdir(root)).filter((name) => name.startsWith('.pending-'))).toEqual([]);
  expect(await manager.listAccounts()).toHaveLength(1);
});

it('holds exclusive manager ownership until disposed and rejects calls on disposed managers', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const root = path.join(parent, 'accounts');
  const first = await createAccountManager({ root });
  await expect(createAccountManager({ root })).rejects.toThrow(/already|owned/i);
  await first.dispose();
  await expect(first.listAccounts()).rejects.toThrow(/closed|disposed/i);
  const second = await createAccountManager({ root });
  expect(await second.listAccounts()).toHaveLength(1);
});

it('does not claim protection while an old passwordless generation still needs cleanup', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const root = path.join(parent, 'accounts');
  const manager = await createAccountManager({ root });
  const account = await manager.create({ alias: 'Synthetic protection upgrade' });
  await manager.unlock(account.id);
  const objectId = randomUUID();
  await manager.put({ objectId, type: 'settings', data: Buffer.from('synthetic upgrade canary') });
  await manager.lock();
  const profilePath = path.join(root, account.id, 'profile.json');
  const old = JSON.parse(await readFile(profilePath, 'utf8'));
  const oldRoot = path.join(root, account.id, old.generation);
  const remove = fs.rm.bind(fs);
  const fault = vi.spyOn(fs, 'rm').mockImplementation(async (target, options) => {
    if (target === oldRoot) throw new Error('synthetic disk cleanup failure');
    return remove(target, options);
  });
  await expect(manager.changeProtection(account.id, { newPassword: 'new synthetic password' })).rejects.toThrow(/cleanup/i);
  fault.mockRestore();
  expect((await manager.listAccounts()).find(item => item.id === account.id)).toMatchObject({ protected: false, protectionChangePending: true });
  await expect(manager.unlock(account.id, 'new synthetic password')).rejects.toThrow(/recover/i);
  await manager.recoverProtectionChange(account.id, 'new synthetic password');
  expect((await manager.listAccounts()).find(item => item.id === account.id)).toMatchObject({ protected: true });
  await expect(readdir(oldRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  await manager.unlock(account.id, 'new synthetic password');
  expect((await manager.get(objectId, 'settings')).toString()).toBe('synthetic upgrade canary');
});

it('does not expose an unprotected key when publishing a protection downgrade fails', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const root = path.join(parent, 'accounts');
  const manager = await createAccountManager({ root });
  const account = await manager.create({ alias: 'Failed downgrade fixture', password: 'synthetic password' });
  await manager.unlock(account.id, 'synthetic password');
  const objectId = randomUUID();
  await manager.put({ objectId, type: 'settings', data: Buffer.from('synthetic private canary') });
  await manager.lock();
  const directory = path.join(root, account.id);
  const profilePath = path.join(directory, 'profile.json');
  const originalProfile = await readFile(profilePath, 'utf8');
  const rename = fs.rename.bind(fs);
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
    if (destination === profilePath && JSON.parse(await readFile(source, 'utf8')).mode === 'open') throw new Error('synthetic profile publication failure');
    return rename(source, destination);
  });
  await expect(manager.changeProtection(account.id, { currentPassword: 'synthetic password' })).rejects.toThrow('synthetic profile publication failure');
  fault.mockRestore();
  const interrupted = JSON.parse(await readFile(profilePath, 'utf8'));
  expect(interrupted.pendingRemoval).toEqual(expect.any(String));
  expect((await manager.listAccounts()).find((entry) => entry.id === account.id)).toMatchObject({ protected: false, protectionChangePending: true });
  for (const name of (await readdir(directory)).filter((entry) => entry.startsWith('.profile-'))) {
    expect(await readFile(path.join(directory, name), 'utf8')).not.toContain('unprotectedKey');
  }
  await expect(manager.unlock(account.id, 'synthetic password')).rejects.toThrow(/recover/i);
  await expect(manager.recoverProtectionChange(account.id, 'wrong')).rejects.toThrow();
  await manager.recoverProtectionChange(account.id, 'synthetic password');
  expect(await readFile(profilePath, 'utf8')).toBe(originalProfile);
  expect(await readdir(directory)).not.toContain(interrupted.pendingRemoval);
  await manager.unlock(account.id, 'synthetic password');
  try {
    expect((await manager.get(objectId, 'settings')).toString()).toBe('synthetic private canary');
  } finally {
    await manager.lock();
  }
});

it('isolates passworded and passwordless profiles without granting default any private access', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const root = path.join(parent, 'accounts');
  const manager = await createAccountManager({ root });
  const privateAccount = await manager.create({ alias: 'Private synthetic', password: 'secret fixture' });
  const openAccount = await manager.create({ alias: 'Open synthetic' });
  expect(openAccount.protected).toBe(false);
  expect(manager.state).toBe('locked');
  const objectId = randomUUID();
  await expect(manager.unlock(privateAccount.id, 'default')).rejects.toThrow();
  await manager.unlock(privateAccount.id, 'secret fixture');
  await manager.put({ objectId, type: 'settings', data: Buffer.from('synthetic private value') });
  await manager.lock();
  await manager.unlock(openAccount.id);
  expect(await manager.listRecords()).toEqual([]);
  await expect(manager.get(objectId, 'settings')).rejects.toThrow();
  await manager.lock();
  await manager.unlock(privateAccount.id, 'secret fixture');
  expect((await manager.get(objectId, 'settings')).toString()).toBe('synthetic private value');
  await manager.lock();
});

it('creates only a locked shared default and requires explicit authentication before account access', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const manager = await createAccountManager({ root: path.join(parent, 'accounts') });
  const accounts = await manager.listAccounts();
  expect(accounts).toEqual([{ id: expect.any(String), alias: 'default', protected: true, shared: true }]);
  expect(manager.state).toBe('locked');
  await expect(manager.listRecords()).rejects.toThrow();
  await expect(manager.unlock(accounts[0].id, 'wrong')).rejects.toThrow();
  expect(manager.state).toBe('locked');
  await manager.unlock(accounts[0].id, 'default');
  expect(await manager.listRecords()).toEqual([]);
  await manager.lock();
  expect(manager.state).toBe('locked');
});

it('cancels an in-flight unlock when locking rather than activating after the lock request', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const manager = await createAccountManager({ root: path.join(parent, 'accounts') });
  const [shared] = await manager.listAccounts();
  const unlocking = manager.unlock(shared.id, 'default');
  const rejected = expect(unlocking).rejects.toThrow(/cancel/i);
  await manager.lock();
  await rejected;
  expect(manager.state).toBe('locked');
  await expect(manager.listRecords()).rejects.toThrow();
});

it('rewraps protected accounts but replaces exposed keys when adding protection to an open account', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const root = path.join(parent, 'accounts');
  const manager = await createAccountManager({ root });
  const account = await manager.create({ alias: 'Protection conversion' });
  await manager.unlock(account.id);
  const objectId = randomUUID();
  await manager.put({ objectId, type: 'media', data: Buffer.from('private fixture bytes') });
  await manager.lock();
  const profilePath = path.join(root, account.id, 'profile.json');
  const before = JSON.parse(await readFile(profilePath, 'utf8'));
  await manager.changeProtection(account.id, { newPassword: 'first fixture password' });
  const protectedProfile = JSON.parse(await readFile(profilePath, 'utf8'));
  expect(protectedProfile.generation).not.toBe(before.generation);
  expect(protectedProfile).not.toHaveProperty('unprotectedKey');
  expect(await readdir(path.join(root, account.id))).not.toContain(before.generation);
  const newRoot = path.join(root, account.id, protectedProfile.generation);
  const newObject = (await readdir(newRoot)).find((name) => name.endsWith('.object'))!;
  const envelope = JSON.parse(await readFile(path.join(newRoot, newObject), 'utf8'));
  expect(() => decryptRecord(Buffer.from(before.unprotectedKey, 'base64'),
    { accountId: account.id, objectId, type: 'media', revision: 1 }, envelope)).toThrow();
  await manager.unlock(account.id, 'first fixture password');
  expect((await manager.get(objectId, 'media')).toString()).toBe('private fixture bytes');
  await manager.lock();
  await expect(manager.changeProtection(account.id, { currentPassword: 'wrong', newPassword: 'next' })).rejects.toThrow();
  await manager.changeProtection(account.id, { currentPassword: 'first fixture password', newPassword: 'second fixture password' });
  const changed = JSON.parse(await readFile(profilePath, 'utf8'));
  expect(changed.generation).toBe(protectedProfile.generation);
  await expect(manager.unlock(account.id, 'first fixture password')).rejects.toThrow();
  await manager.unlock(account.id, 'second fixture password');
  expect((await manager.get(objectId, 'media')).toString()).toBe('private fixture bytes');
  await manager.lock();
});

it('requires reauthentication for rename and delete and keeps the reserved default', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const manager = await createAccountManager({ root: path.join(parent, 'accounts') });
  const [shared] = await manager.listAccounts();
  await expect(manager.remove(shared.id, 'default')).rejects.toThrow(/default/i);
  await expect(manager.rename(shared.id, 'another', 'default')).rejects.toThrow(/default/i);
  const account = await manager.create({ alias: 'Old alias', password: 'fixture password' });
  await expect(manager.rename(account.id, 'New alias', 'wrong')).rejects.toThrow();
  await manager.rename(account.id, 'New alias', 'fixture password');
  expect((await manager.listAccounts()).find((entry) => entry.id === account.id)?.alias).toBe('New alias');
  await expect(manager.remove(account.id, 'wrong')).rejects.toThrow();
  await manager.remove(account.id, 'fixture password');
  expect(await manager.listAccounts()).toEqual([shared]);
});

it('exports a protected snapshot and imports all records into a new isolated account', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const manager = await createAccountManager({ root: path.join(parent, 'accounts') });
  const original = await manager.create({ alias: 'Archive source', password: 'original fixture password' });
  await manager.unlock(original.id, 'original fixture password');
  const objectId = randomUUID();
  await manager.put({ objectId, type: 'image', metadata: { name: 'PRIVATE_EXPORT_NAME' }, data: Buffer.from('PRIVATE_EXPORT_BYTES') });
  const destination = path.join(parent, 'backup.zip');
  await manager.exportAccount(destination);
  expect((await readFile(destination)).includes(Buffer.from('PRIVATE_EXPORT'))).toBe(false);
  await manager.lock();
  const imported = await manager.importAccount({ source: destination, archivePassword: 'original fixture password',
    alias: 'Imported account', protection: 'password', password: 'new fixture password' });
  expect(imported.id).not.toBe(original.id);
  expect(manager.state).toBe('locked');
  await expect(manager.unlock(imported.id, 'original fixture password')).rejects.toThrow();
  await manager.unlock(imported.id, 'new fixture password');
  expect((await manager.get(objectId, 'image')).toString()).toBe('PRIVATE_EXPORT_BYTES');
  expect((await manager.listRecords())[0].metadata).toEqual({ name: 'PRIVATE_EXPORT_NAME' });
  await manager.lock();
});

it('revokes captured storage views when the account changes', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-manager-test-'));
  roots.push(parent);
  const manager = await createAccountManager({ root: path.join(parent, 'accounts') });
  const accountA = await manager.create({ alias: 'View A' });
  const accountB = await manager.create({ alias: 'View B' });
  await manager.unlock(accountA.id);
  const viewA = await manager.captureStorage();
  const objectId = randomUUID();
  await viewA.put({ objectId, type: 'settings', data: Buffer.from('A') });
  await manager.lock();
  expect(viewA.signal.aborted).toBe(true);
  await manager.unlock(accountB.id);
  await expect(viewA.get(objectId, 'settings')).rejects.toThrow(/stale|locked/i);
  await expect(viewA.put({ objectId, type: 'settings', data: Buffer.from('late') })).rejects.toThrow(/stale|locked/i);
  expect(await manager.listRecords()).toEqual([]);
});
