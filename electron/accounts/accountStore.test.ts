import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAccountStore, openAccountStore } from './accountStore.cjs';
import { encryptRecord, maxRecordBytes } from './accountCrypto.cjs';

const temporaryRoots: string[] = [];
const openStores: Awaited<ReturnType<typeof createAccountStore>>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const store of openStores.splice(0)) await store.close();
  for (const root of temporaryRoots.splice(0)) {
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(tmpdir()));
    expect(path.basename(root)).toMatch(/^rpgraph-account-store-test-/);
    await rm(root, { recursive: true, force: true });
  }
});

it('exports an immutable snapshot while newer writes continue and revokes reads on close', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const store = await createAccountStore({ root: path.join(parent, randomUUID()), accountId: randomUUID(), key: randomBytes(32) });
  const objectId = randomUUID();
  await store.put({ objectId, type: 'settings', data: Buffer.from('before') });
  const snapshot = await store.snapshot();
  await store.put({ objectId, type: 'settings', data: Buffer.from('after') });
  expect((await snapshot.get(objectId, 'settings')).toString()).toBe('before');
  expect((await store.get(objectId, 'settings')).toString()).toBe('after');
  expect(snapshot.entries[0].revision).toBe(1);
  await store.close();
  expect(() => snapshot.get(objectId, 'settings')).toThrow(/closed/i);
});

it('removes a catalog record without changing an earlier immutable snapshot', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const store = await createAccountStore({ root: path.join(parent, randomUUID()), accountId: randomUUID(), key: randomBytes(32) });
  const objectId = randomUUID();
  await store.put({ objectId, type: 'account-file', data: Buffer.from('before unlink') });
  const snapshot = await store.snapshot();
  await store.remove(objectId, 'account-file');
  expect(await store.list()).toEqual([]);
  await expect(store.get(objectId, 'account-file')).rejects.toThrow();
  expect((await snapshot.get(objectId, 'account-file')).toString()).toBe('before unlink');
  await store.close();
});

async function fixture() {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const options = { root: path.join(parent, randomUUID()), accountId: randomUUID(), key: randomBytes(32) };
  const store = await createAccountStore(options);
  openStores.push(store);
  return { parent, options, store, objectId: randomUUID() };
}

it('persists an encrypted catalog and binary record without exposing private metadata', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const root = path.join(parent, randomUUID());
  const accountId = randomUUID();
  const objectId = randomUUID();
  const key = randomBytes(32);
  const store = await createAccountStore({ root, accountId, key });
  const data = Buffer.from('PRIVATE_SYNTHETIC_STORY_CANARY');
  await store.put({ objectId, type: 'storybook', metadata: { name: 'PRIVATE_SYNTHETIC_TITLE' }, data });
  await store.close();
  for (const name of await readdir(root)) {
    const serialized = await readFile(path.join(root, name), 'utf8');
    expect(serialized).not.toContain('PRIVATE_SYNTHETIC');
  }
  const reopened = await openAccountStore({ root, accountId, key });
  expect(await reopened.get(objectId, 'storybook')).toEqual(data);
  expect(await reopened.list()).toEqual([{ objectId, type: 'storybook', metadata: { name: 'PRIVATE_SYNTHETIC_TITLE' }, revision: 1 }]);
  await reopened.close();
});

it('keeps the last authenticated catalog as a recovery generation before replacing it', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const root = path.join(parent, randomUUID());
  const store = await createAccountStore({ root, accountId: randomUUID(), key: randomBytes(32) });
  const initial = await readFile(path.join(root, 'catalog'));
  await store.put({ objectId: randomUUID(), type: 'settings', data: Buffer.from('{}') });
  expect(await readFile(path.join(root, 'catalog.previous'))).toEqual(initial);
  await store.close();
});

it('prevents two writers from opening the same store until the first has closed', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const options = { root: path.join(parent, randomUUID()), accountId: randomUUID(), key: randomBytes(32) };
  const first = await createAccountStore(options);
  let second: Awaited<ReturnType<typeof openAccountStore>> | undefined;
  try {
    second = await openAccountStore(options).catch(() => undefined);
    expect(second).toBeUndefined();
  } finally {
    await second?.close();
    await first.close();
  }
  const reopened = await openAccountStore(options);
  await reopened.close();
});

it('rejects a wrong key or account without stranding its lock, and forbids changing record type', async () => {
  const { options, store, objectId } = await fixture();
  await store.put({ objectId, type: 'settings', data: Buffer.from('synthetic') });
  await expect(store.get(objectId, 'storybook')).rejects.toThrow();
  await expect(store.put({ objectId, type: 'storybook', data: Buffer.from('replacement') })).rejects.toThrow();
  await store.close();
  await expect(openAccountStore({ ...options, key: randomBytes(32) })).rejects.toThrow();
  await expect(openAccountStore({ ...options, accountId: randomUUID() })).rejects.toThrow();
  const reopened = await openAccountStore(options);
  openStores.push(reopened);
  expect(await reopened.get(objectId, 'settings')).toEqual(Buffer.from('synthetic'));
});

it('serializes revisions and snapshots without retaining mutable caller data or metadata', async () => {
  const { store, objectId } = await fixture();
  const data = Buffer.from('first');
  const metadata = { name: 'first', nested: { value: 1 } };
  const first = store.put({ objectId, type: 'settings', metadata, data });
  const snapshot = store.list();
  const firstRead = store.get(objectId, 'settings');
  data.fill(0);
  metadata.nested.value = 99;
  const second = store.put({ objectId, type: 'settings', metadata: { name: 'second' }, data: Buffer.from('second') });
  await Promise.all([first, second]);
  const entries = await snapshot;
  expect(entries).toEqual([{ objectId, type: 'settings', revision: 1, metadata: { name: 'first', nested: { value: 1 } } }]);
  expect(await firstRead).toEqual(Buffer.from('first'));
  (entries[0].metadata as { name: string }).name = 'mutated snapshot';
  expect(await store.list()).toEqual([{ objectId, type: 'settings', revision: 2, metadata: { name: 'second' } }]);
  expect(await store.get(objectId, 'settings')).toEqual(Buffer.from('second'));
});

it('close is idempotent, refuses new work immediately and drains accepted writes', async () => {
  const { options, store, objectId } = await fixture();
  const pending = store.put({ objectId, type: 'settings', data: Buffer.from('before close') });
  const closing = store.close();
  expect(store.close()).toBe(closing);
  expect(() => store.list()).toThrow('closed');
  expect(() => store.get(objectId, 'settings')).toThrow('closed');
  expect(() => store.put({ objectId, type: 'settings', data: Buffer.from('after close') })).toThrow('closed');
  await Promise.all([pending, closing]);
  const reopened = await openAccountStore(options);
  openStores.push(reopened);
  expect(await reopened.get(objectId, 'settings')).toEqual(Buffer.from('before close'));
});

it('preserves committed data and revision if publishing the replacement catalog fails', async () => {
  const { options, store, objectId } = await fixture();
  await store.put({ objectId, type: 'settings', data: Buffer.from('committed') });
  const previousCatalog = await readFile(path.join(options.root, 'catalog'));
  const rename = fs.rename.bind(fs);
  const fault = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
    if (destination === path.join(options.root, 'catalog')) throw new Error('synthetic rename failure');
    return rename(source, destination);
  });
  await expect(store.put({ objectId, type: 'settings', data: Buffer.from('uncommitted') })).rejects.toThrow('synthetic rename failure');
  fault.mockRestore();
  expect(await readFile(path.join(options.root, 'catalog'))).toEqual(previousCatalog);
  expect(await store.get(objectId, 'settings')).toEqual(Buffer.from('committed'));
  expect((await store.list())[0].revision).toBe(1);
  await store.close();
  const reopened = await openAccountStore(options);
  openStores.push(reopened);
  expect(await reopened.get(objectId, 'settings')).toEqual(Buffer.from('committed'));
  await reopened.put({ objectId, type: 'settings', data: Buffer.from('retried') });
  expect((await reopened.list())[0].revision).toBe(2);
});

it('rejects an authenticated catalog containing traversal paths rather than UUID object references', async () => {
  const { options, store, objectId } = await fixture();
  await store.close();
  const catalog = { version: 1, entries: [{ objectId, fileId: '../outside', type: 'settings', revision: 1, metadata: {} }] };
  const envelope = encryptRecord(options.key, {
    accountId: options.accountId, objectId: '00000000-0000-0000-0000-000000000000', type: 'catalog', revision: 0,
  }, Buffer.from(JSON.stringify(catalog)));
  await writeFile(path.join(options.root, 'catalog'), JSON.stringify(envelope));
  await expect(openAccountStore(options).then((opened) => { openStores.push(opened); return opened; })).rejects.toThrow();
});

it('rejects a linked root even when it points at an otherwise valid store', async () => {
  const { parent, options, store } = await fixture();
  await store.close();
  const linkedRoot = path.join(parent, 'linked-root');
  await symlink(options.root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(openAccountStore({ ...options, root: linkedRoot }).then((opened) => { openStores.push(opened); return opened; })).rejects.toThrow('real directory');
});

it('fails closed when a stored record ciphertext has been changed', async () => {
  const { options, store, objectId } = await fixture();
  await store.put({ objectId, type: 'settings', data: Buffer.from('synthetic private content') });
  const fileName = (await readdir(options.root)).find((name) => name.endsWith('.object'))!;
  const file = path.join(options.root, fileName);
  const envelope = JSON.parse(await readFile(file, 'utf8'));
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  ciphertext[0] ^= 1;
  await writeFile(file, JSON.stringify({ ...envelope, ciphertext: ciphertext.toString('base64') }));
  await expect(store.get(objectId, 'settings')).rejects.toThrow('authenticate');
});

it('rejects oversized writes and invalid object paths before accepting work', async () => {
  const { options, store, objectId } = await fixture();
  const before = await readdir(options.root);
  expect(() => {
    const result = store.put({ objectId, type: 'media', data: Buffer.alloc(maxRecordBytes + 1) });
    void result.catch(() => {});
  }).toThrow('size');
  expect(() => store.put({ objectId: '../escape', type: 'settings', data: Buffer.from('{}') })).toThrow();
  expect(await readdir(options.root)).toEqual(before);
});

it('checks prepared-commit authority before writing and again immediately before publishing', async () => {
  const { options, store, objectId } = await fixture();
  await store.put({ objectId, type: 'settings', data: Buffer.from('committed') });
  const before = await readdir(options.root);
  await expect(store.put({ objectId, type: 'settings', data: Buffer.from('rejected') }, {
    beforePublish: () => { throw new Error('revoked at start'); },
  })).rejects.toThrow('revoked at start');
  expect(await readdir(options.root)).toEqual(before);
  let checks = 0;
  await expect(store.put({ objectId, type: 'settings', data: Buffer.from('stale') }, {
    beforePublish: () => { if (++checks === 2) throw new Error('revoked before publication'); },
  })).rejects.toThrow('revoked before publication');
  expect(checks).toBe(2);
  expect(await store.get(objectId, 'settings')).toEqual(Buffer.from('committed'));
  await store.close();
  const reopened = await openAccountStore(options);
  openStores.push(reopened);
  expect(await reopened.get(objectId, 'settings')).toEqual(Buffer.from('committed'));
});

it('captures create and open keys before returning control to their caller', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-store-test-'));
  temporaryRoots.push(parent);
  const key = randomBytes(32);
  const original = Buffer.from(key);
  const options = { root: path.join(parent, randomUUID()), accountId: randomUUID(), key };
  const creating = createAccountStore(options);
  key.fill(0);
  const store = await creating;
  openStores.push(store);
  const objectId = randomUUID();
  await store.put({ objectId, type: 'settings', data: Buffer.from('synthetic content') });
  await store.close();
  const openingKey = Buffer.from(original);
  const opening = openAccountStore({ ...options, key: openingKey });
  openingKey.fill(0);
  const reopened = await opening;
  openStores.push(reopened);
  expect(await reopened.get(objectId, 'settings')).toEqual(Buffer.from('synthetic content'));
  await reopened.close();
  const verified = await openAccountStore({ ...options, key: original });
  openStores.push(verified);
  expect(await verified.get(objectId, 'settings')).toEqual(Buffer.from('synthetic content'));
});
