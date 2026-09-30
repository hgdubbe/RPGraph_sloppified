import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createAccountManager } from './accountManager.cjs';
import { createAccountFiles } from './accountFiles.cjs';

it('stores familiar file paths inside the account vault and revokes the filesystem on lock', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'rpgraph-account-files-test-'));
  const manager = await createAccountManager({ root: path.join(parent, 'accounts') });
  try {
    const [shared] = await manager.listAccounts();
    await manager.unlock(shared.id, 'default');
    const root = path.join(parent, 'virtual', shared.id);
    const files = await createAccountFiles({ root, view: await manager.captureStorage() });
    await files.mkdir(path.join(root, 'files'), { recursive: true });
    const file = path.join(root, 'files', 'Private test story.json');
    await files.writeFile(file, '{"fixture":"private synthetic content"}', 'utf8');
    await expect(files.readFile(path.join(root, '..', 'escape.json'))).rejects.toMatchObject({ code: 'EINVAL' });
    expect(await files.readFile(file, 'utf8')).toBe('{"fixture":"private synthetic content"}');
    expect(await files.readdir(path.join(root, 'files'))).toEqual(['Private test story.json']);
    expect((await files.stat(file)).isFile()).toBe(true);
    const moved = path.join(root, 'files', 'Moved.json');
    await files.rename(file, moved);
    expect(await files.readFile(moved, 'utf8')).toBe('{"fixture":"private synthetic content"}');
    await expect(files.readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
    await files.writeFile(file, 'other', 'utf8');
    await expect(files.rename(moved, file)).rejects.toMatchObject({ code: 'EEXIST' });
    const records = await manager.listRecords();
    expect(records.every((entry) => entry.type === 'account-file')).toBe(true);
    await files.unlink(file);
    await files.unlink(moved);
    expect(await files.readdir(path.join(root, 'files'))).toEqual([]);
    await manager.lock();
    await expect(files.readFile(file)).rejects.toThrow(/locked|stale/i);
  } finally { await manager.dispose(); await rm(parent, { recursive: true, force: true }); }
});
