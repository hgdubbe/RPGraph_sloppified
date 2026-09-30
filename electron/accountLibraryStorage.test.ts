import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createNpcLibraryService } = require('./npcLibrary.cjs');
const { createThemeLibraryService } = require('./themeLibrary.cjs');
const { createPhoneHomeThemeLibraryService } = require('./phoneHomeThemeLibrary.cjs');
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

it.each([
  ['themes', createThemeLibraryService, 'theme.json'],
  ['phone-themes', createPhoneHomeThemeLibraryService, 'phone-theme.json'],
  ['npc-characters', createNpcLibraryService, 'card.json'],
] as const)('%s reads account storage without creating a plaintext user directory', async (kind, createService, fileName) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rpgraph-library-storage-'));
  temporaryDirectories.push(root);
  const roots = { bundled: path.join(root, 'bundled'), user: path.join(root, 'virtual-user') };
  const npc = kind === 'npc-characters';
  await fs.mkdir(npc ? roots.bundled : path.join(roots.bundled, 'public'), { recursive: true });
  await fs.writeFile(path.join(roots.bundled, ...(npc ? [] : ['public']), fileName),
    JSON.stringify(npc ? { public: true } : { id: 'public', label: 'Bundled theme' }));
  const userFs = {
    mkdir: vi.fn(async () => undefined),
    readdir: vi.fn(async (directory: string) => {
      assert.equal(directory, roots.user);
      return [{ name: npc ? fileName : 'private', isFile: () => npc, isDirectory: () => !npc }];
    }),
    readFile: vi.fn(async (file: string) => {
      assert.equal(file, path.join(roots.user, ...(npc ? [] : ['private']), fileName));
      return JSON.stringify(npc ? { private: true } : { id: 'private', label: 'Account theme' });
    }),
    stat: vi.fn(async () => ({ mtime: new Date(0) })),
  };
  const openPath = vi.fn(async () => '');
  const service = createService({ roots, userFs, openPath });
  const result = await service.reload();
  assert.equal(userFs.readFile.mock.calls.length, 1);
  assert.equal(userFs.readdir.mock.calls.length, 1);
  if (npc) {
    assert.equal(result.skipped, 2);
    assert.equal(userFs.stat.mock.calls.length, 1);
    await service.setGamePassword('test');
    assert.equal(userFs.readFile.mock.calls.length, 2);
  } else {
    assert.deepEqual(result.manifests.map((item: { id: string }) => item.id), ['public', 'private']);
  }
  await service.openUserDirectory();
  assert.deepEqual(openPath.mock.calls, [[roots.user]]);
  assert.equal(userFs.mkdir.mock.calls.length, 2);
  await assert.rejects(fs.stat(roots.user), { code: 'ENOENT' });
});
