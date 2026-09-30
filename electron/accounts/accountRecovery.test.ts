import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { recoverAccountStoreLocks } from './accountRecovery.cjs';

it('recovers abandoned store locks only with host exclusivity, and never removes a live lock', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-recovery-test-'));
  const root = path.join(parent, 'accounts');
  const store = path.join(root, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
  try {
    await mkdir(store, { recursive: true });
    const lock = path.join(store, 'store.lock');
    await writeFile(lock, '');
    await expect(recoverAccountStoreLocks(root, { exclusiveHost: false })).rejects.toThrow(/exclusive/i);
    expect(await readFile(lock, 'utf8')).toBe('');
    await recoverAccountStoreLocks(root, { exclusiveHost: true });
    await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(lock, JSON.stringify({ pid: process.pid }));
    await expect(recoverAccountStoreLocks(root, { exclusiveHost: true })).rejects.toThrow(/running/i);
    expect(JSON.parse(await readFile(lock, 'utf8')).pid).toBe(process.pid);
    await writeFile(lock, JSON.stringify({ pid: 2147483647 }));
    await recoverAccountStoreLocks(root, { exclusiveHost: true });
    await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(parent, { recursive: true, force: true }); }
});
