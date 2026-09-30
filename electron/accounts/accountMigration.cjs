const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { maxRecordBytes } = require('./accountCrypto.cjs');
const { validateAccountRelativePath } = require('./accountFiles.cjs');

const legacyFiles = ['settings.json', 'image-dialog-state.json', 'workflow-state.json', 'comfy-model-state.json'];
const legacyDirectories = ['files', 'characters', 'npc-characters', 'themes', 'phone-themes'];
const maxEntries = 100000;
const maxBytes = 8 * 1024 ** 3;
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

/** Metadata-only discovery; empty folders are not legacy data. Never follows links. */
async function legacyDataAvailable({ root }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Invalid legacy data root.');
  root = path.resolve(root);
  async function statIfPresent(target) {
    try { return await fs.lstat(target); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  const rootStat = await statIfPresent(root);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink() || !samePath(await fs.realpath(root), root)) return false;
  for (const name of legacyFiles) {
    const stat = await statIfPresent(path.join(root, name));
    if (stat?.isFile() && !stat.isSymbolicLink()) return true;
  }
  const pending = legacyDirectories.map(name => path.join(root, name));
  let visited = 0;
  while (pending.length) {
    const target = pending.pop();
    const stat = await statIfPresent(target);
    if (!stat?.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(target), target)) continue;
    const directory = await fs.opendir(target);
    for await (const entry of directory) {
      // Remain conservative if discovery exceeds migration's entry limit.
      if (++visited > maxEntries) return true;
      if (entry.isFile()) return true;
      if (entry.isDirectory()) pending.push(path.join(target, entry.name));
    }
  }
  return false;
}

/** Host must obtain explicit migration consent before iterating. Originals are read-only. */
async function* readLegacyAccountFiles({ root, transformSettings, preferences, signal, onSourceFile }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Invalid legacy data root.');
  root = path.resolve(root);
  function check() { if (signal?.aborted) throw new Error('Migration cancelled.'); }
  async function checkedStat(target) {
    check();
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !samePath(await fs.realpath(target), target)) throw new Error('Linked legacy paths are not supported.');
    return stat;
  }
  if (!(await checkedStat(root)).isDirectory()) throw new Error('Invalid legacy data root.');
  let count = 0;
  let total = 0;
  function bounded(relativePath, kind, data) {
    check(); validateAccountRelativePath(relativePath);
    total += data.length;
    if (data.length > maxRecordBytes || ++count > maxEntries || total > maxBytes) throw new Error('Migration exceeds supported limits.');
    return { relativePath, kind, data };
  }
  async function* walk(relativePath, expectedKind) {
    validateAccountRelativePath(relativePath);
    const target = path.join(root, ...relativePath.split('/'));
    const stat = await checkedStat(target);
    if (expectedKind === 'file' && !stat.isFile() || expectedKind === 'directory' && !stat.isDirectory()) throw new Error('Unexpected legacy entry type.');
    if (stat.isDirectory()) {
      yield bounded(relativePath, 'directory', Buffer.alloc(0));
      const directory = await fs.opendir(target);
      for await (const entry of directory) {
        await checkedStat(target);
        yield* walk(`${relativePath}/${entry.name}`);
      }
    } else if (stat.isFile()) {
      if (stat.size > maxRecordBytes) throw new Error('Legacy file exceeds supported limits.');
      const file = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      let data;
      try {
        const opened = await file.stat();
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > maxRecordBytes) throw new Error('Legacy entry changed during migration.');
        await checkedStat(target);
        data = Buffer.alloc(opened.size);
        let offset = 0;
        while (offset < data.length) {
          check();
          const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
          if (!bytesRead) throw new Error('Legacy entry changed during migration.');
          offset += bytesRead;
        }
        const after = await file.stat();
        if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error('Legacy entry changed during migration.');
        // Capture the original bytes before settings conversion. Cleanup is
        // offered separately, only after the account has been published.
        if (onSourceFile) await onSourceFile({ relativePath, data, stat: after });
        if (relativePath === 'settings.json' && transformSettings) {
          const transformed = Buffer.from(JSON.stringify(await transformSettings(JSON.parse(data.toString('utf8')))));
          data.fill(0); data = transformed;
        }
        yield bounded(relativePath, 'file', data);
      } finally { data?.fill(0); await file.close(); }
    } else throw new Error('Unsupported legacy entry type.');
  }
  for (const [names, kind] of [[legacyFiles, 'file'], [legacyDirectories, 'directory']]) {
    for (const name of names) {
      try { await fs.lstat(path.join(root, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      yield* walk(name, kind);
    }
  }
  if (preferences !== undefined) {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences) || Object.values(preferences).some(value => typeof value !== 'string')) throw new Error('Invalid legacy preferences.');
    const data = Buffer.from(JSON.stringify(preferences));
    try { yield bounded('browser-preferences.json', 'file', data); } finally { data.fill(0); }
  }
}

module.exports = { readLegacyAccountFiles, legacyDataAvailable, legacyFiles, legacyDirectories };
