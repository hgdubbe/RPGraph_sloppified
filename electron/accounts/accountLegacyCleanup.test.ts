import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { readLegacyAccountFiles } from './accountMigration.cjs';
import { createLegacyCleanupPlan, offerLegacyCleanup } from './accountLegacyCleanup.cjs';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'rpgraph-cleanup-test-')); roots.push(root);
  await mkdir(path.join(root, 'files'));
  await writeFile(path.join(root, 'files', 'plain.json'), '{"synthetic":"plain"}');
  await writeFile(path.join(root, 'files', 'protected.json'), '{"format":"rpgraph-encrypted-storybook","ciphertext":"synthetic"}');
  await writeFile(path.join(root, 'unrelated.txt'), 'must remain');
  const plan = createLegacyCleanupPlan({ root });
  for await (const entry of readLegacyAccountFiles({ root, onSourceFile: plan.record })) void entry;
  return { root, plan };
}

it('requires explicit consent and deletes only unchanged imported unprotected files', async () => {
  const { root, plan } = await fixture();
  expect(plan.preview().files.map(file => file.relativePath)).toEqual(['files/plain.json']);
  await expect(plan.erase()).rejects.toThrow('consent');
  expect(await readFile(path.join(root, 'files/plain.json'), 'utf8')).toContain('plain');
  const result = await plan.erase({ consent: true });
  expect(result.deleted).toEqual(['files/plain.json']);
  await expect(readFile(path.join(root, 'files/plain.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(path.join(root, 'files/protected.json'), 'utf8')).toContain('ciphertext');
  expect(await readFile(path.join(root, 'unrelated.txt'), 'utf8')).toBe('must remain');
});

it('skips changed files, new files, and replaced directory junctions', async () => {
  const { root, plan } = await fixture();
  await writeFile(path.join(root, 'files/plain.json'), 'new content after import');
  await writeFile(path.join(root, 'files/new.json'), 'not imported');
  expect((await plan.erase({ consent: true })).skipped).toEqual(['files/plain.json']);
  expect(await readFile(path.join(root, 'files/plain.json'), 'utf8')).toBe('new content after import');
  expect(await readFile(path.join(root, 'files/new.json'), 'utf8')).toBe('not imported');
  const second = await fixture();
  await rm(path.join(second.root, 'files'), { recursive: true });
  const external = await mkdtemp(path.join(tmpdir(), 'rpgraph-cleanup-outside-')); roots.push(external);
  await writeFile(path.join(external, 'plain.json'), 'outside data');
  await symlink(external, path.join(second.root, 'files'), process.platform === 'win32' ? 'junction' : 'dir');
  expect((await second.plan.erase({ consent: true })).skipped).toEqual(['files/plain.json']);
  expect(await readFile(path.join(external, 'plain.json'), 'utf8')).toBe('outside data');
});

it('allows review before deletion, requires final checked consent, and offers the folder afterward', async () => {
  const { root, plan } = await fixture();
  const answers = [{ response: 1 }, { response: 0 }, { response: 2 }, { response: 1, checkboxChecked: true }, { response: 1 }];
  const shown: Array<{ title: string; message: string; detail: string; buttons: string[]; defaultId: number }> = [];
  const opened: string[] = [];
  let browserDeleted = false;
  await offerLegacyCleanup({ plan, account: { alias: 'Synthetic private', protected: true }, preferenceKeys: ['synthetic.pref'],
    showMessageBox: async options => { shown.push(options); return answers.shift()!; },
    deletePreferences: async () => { browserDeleted = true; return { deleted: 1, skipped: 0 }; },
    openFolder: async folder => { opened.push(folder); },
  });
  expect(shown[0].defaultId).toBe(0);
  expect(shown[0].detail).toContain('only be accessible');
  expect(shown[1].detail).toContain('files/plain.json');
  expect(shown[1].detail).toContain('synthetic.pref');
  expect(shown[3].message).toContain('permanently delete');
  expect(shown[4].detail).toContain('remaining');
  expect(opened).toEqual([root]);
  expect(browserDeleted).toBe(true);
  await expect(readFile(path.join(root, 'files/plain.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each([
  { answers: [{ response: 0 }] },
  { answers: [{ response: 2 }, { response: 1, checkboxChecked: false }] },
  { answers: [{ response: 2 }, { response: 0, checkboxChecked: true }] },
])('keeps originals and browser preferences when cleanup is declined or not confirmed: %j', async ({ answers }) => {
  const { root, plan } = await fixture();
  let browserDeleted = false;
  await offerLegacyCleanup({ plan, account: { alias: 'Synthetic', protected: true }, preferenceKeys: ['synthetic'],
    showMessageBox: async () => answers.shift()!,
    deletePreferences: async () => { browserDeleted = true; return { deleted: 1, skipped: 0 }; },
  });
  expect(browserDeleted).toBe(false);
  expect(await readFile(path.join(root, 'files/plain.json'), 'utf8')).toContain('plain');
});

it('does not delete files when the migration owner is no longer authorized', async () => {
  const { root, plan } = await fixture();
  await expect(plan.erase({ consent: true, assertCanDelete: () => { throw new Error('Owner closed'); } })).rejects.toThrow('Owner closed');
  expect(await readFile(path.join(root, 'files/plain.json'), 'utf8')).toContain('plain');
});
