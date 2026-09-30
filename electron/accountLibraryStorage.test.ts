import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createNpcLibraryService } = require('./npcLibrary.cjs');
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

it('reads private NPC and saved-storybook libraries through account storage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rpgraph-library-storage-'));
  temporaryDirectories.push(root);
  const roots = {
    bundled: path.join(root, 'bundled'),
    user: path.join(root, 'virtual-user'),
    storybooks: path.join(root, 'virtual-storybooks'),
  };
  await fs.mkdir(roots.bundled, { recursive: true });
  await fs.writeFile(path.join(roots.bundled, 'card.json'), JSON.stringify({ public: true }));
  const userFs = {
    mkdir: vi.fn(async () => undefined),
    readdir: vi.fn(async (directory: string) => {
      assert.ok(directory === roots.user || directory === roots.storybooks);
      return [{ name: 'card.json', isFile: () => true }];
    }),
    readFile: vi.fn(async (file: string) => {
      assert.ok(file === path.join(roots.user, 'card.json') || file === path.join(roots.storybooks, 'card.json'));
      return JSON.stringify({ private: true });
    }),
    stat: vi.fn(async () => ({ mtime: new Date(0) })),
  };
  const openPath = vi.fn(async () => '');
  const service = createNpcLibraryService({ roots, userFs, openPath });
  const result = await service.reload();
  assert.equal(result.skipped, 2);
  assert.equal(userFs.readFile.mock.calls.length, 2);
  assert.equal(userFs.readdir.mock.calls.length, 2);
  assert.equal(userFs.stat.mock.calls.length, 2);
  await service.setGamePassword('test');
  assert.equal(userFs.readFile.mock.calls.length, 4);
  await service.openUserDirectory();
  assert.deepEqual(openPath.mock.calls, [[roots.user]]);
  assert.equal(userFs.mkdir.mock.calls.length, 2);
  await assert.rejects(fs.stat(roots.user), { code: 'ENOENT' });
  await assert.rejects(fs.stat(roots.storybooks), { code: 'ENOENT' });
});
