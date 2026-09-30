const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { maxRecordBytes } = require('./accountCrypto.cjs');

function failure(code) { return Object.assign(new Error(`Account file operation failed: ${code}.`), { code }); }
function validateRelative(value) {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32) ||
      value.split('/').some((part) => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part) ||
        /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(part))) {
    throw failure('EINVAL');
  }
  return value;
}

/** A deliberately small filesystem for existing app-owned JSON/media paths.
 * It never creates a plaintext mirror and never falls back to native disk. */
async function createAccountFiles({ root, view }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw failure('EINVAL');
  root = path.resolve(root);
  view.assertCurrent();
  const files = new Map();
  const keyFor = (relative) => process.platform === 'win32' ? relative.toLowerCase() : relative;
  for (const entry of await view.list()) {
    if (entry.type !== 'account-file') continue;
    const metadata = entry.metadata;
    if (!metadata || !['file', 'directory'].includes(metadata.kind) || !Number.isSafeInteger(metadata.size) || metadata.size < 0 ||
        metadata.size > maxRecordBytes || !Number.isSafeInteger(metadata.mtimeMs) || metadata.mtimeMs < 0) throw failure('EINVAL');
    const relative = validateRelative(metadata.relativePath);
    if (files.has(keyFor(relative))) throw failure('EEXIST');
    files.set(keyFor(relative), { ...entry, metadata: structuredClone(metadata) });
  }
  let queue = Promise.resolve();
  function enqueue(operation) {
    view.assertCurrent();
    const next = queue.then(() => { view.assertCurrent(); return operation(); });
    queue = next.catch(() => {});
    return next;
  }
  function relative(file) {
    view.assertCurrent();
    if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) throw failure('EINVAL');
    const value = path.relative(root, path.resolve(file)).replaceAll(path.sep, '/');
    if (!value) return '';
    return validateRelative(value);
  }
  function getEntry(value) {
    if (!value) return { metadata: { kind: 'directory', size: 0, mtimeMs: 0, relativePath: '' } };
    const entry = files.get(keyFor(value));
    if (!entry) throw failure('ENOENT');
    return entry;
  }
  function requireDirectory(value) { if (getEntry(value).metadata.kind !== 'directory') throw failure('ENOTDIR'); }
  async function write(value, kind, bytes, exclusive) {
    const existing = files.get(keyFor(value));
    if (exclusive && existing) throw failure('EEXIST');
    if (existing && existing.metadata.kind !== kind) throw failure(kind === 'file' ? 'EISDIR' : 'ENOTDIR');
    const parent = path.posix.dirname(value);
    requireDirectory(parent === '.' ? '' : parent);
    const metadata = { relativePath: value, kind, size: bytes.length, mtimeMs: Date.now() };
    const entry = { objectId: existing?.objectId || randomUUID(), type: 'account-file', metadata, data: bytes };
    await view.put(entry);
    files.set(keyFor(value), { objectId: entry.objectId, type: entry.type, metadata });
  }
  async function read(value) {
    const entry = getEntry(value);
    if (entry.metadata.kind !== 'file') throw failure('EISDIR');
    const bytes = await view.get(entry.objectId, 'account-file');
    if (bytes.length !== entry.metadata.size) { bytes.fill(0); throw failure('EINVAL'); }
    return bytes;
  }
  return {
    root,
    contains(file) {
      if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
      const value = path.relative(root, path.resolve(file));
      return !value || (!value.startsWith(`..${path.sep}`) && value !== '..' && !path.isAbsolute(value));
    },
    async mkdir(directory, options = {}) {
      const value = relative(directory);
      return enqueue(async () => {
        if (!value) return;
        const parts = value.split('/');
        if (!options.recursive && files.has(keyFor(value))) throw failure('EEXIST');
        if (!options.recursive) requireDirectory(parts.slice(0, -1).join('/'));
        for (let index = 1; index <= parts.length; index += 1) {
          const current = parts.slice(0, index).join('/');
          if (files.has(keyFor(current))) requireDirectory(current);
          else await write(current, 'directory', Buffer.alloc(0), true);
        }
      });
    },
    async readFile(file, options) {
      const value = relative(file);
      const encoding = typeof options === 'string' ? options : options?.encoding;
      return enqueue(async () => {
        const bytes = await read(value);
        if (!encoding) return bytes;
        try { return bytes.toString(encoding); } finally { bytes.fill(0); }
      });
    },
    async writeFile(file, contents, options) {
      const value = relative(file);
      const encoding = typeof options === 'string' ? options : options?.encoding || 'utf8';
      const bytes = Buffer.from(contents, typeof contents === 'string' ? encoding : undefined);
      try {
        if (bytes.length > maxRecordBytes) throw failure('EFBIG');
        return await enqueue(() => write(value, 'file', bytes, options?.flag === 'wx'));
      } finally { bytes.fill(0); }
    },
    async readdir(directory, options = {}) {
      const value = relative(directory);
      return enqueue(() => {
        requireDirectory(value);
        const entries = [...files.values()].filter((entry) => {
          const parent = path.posix.dirname(entry.metadata.relativePath);
          return keyFor(parent === '.' ? '' : parent) === keyFor(value);
        }).map((entry) => ({ name: path.posix.basename(entry.metadata.relativePath),
          isDirectory: () => entry.metadata.kind === 'directory', isFile: () => entry.metadata.kind === 'file', isSymbolicLink: () => false }));
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return options.withFileTypes ? entries : entries.map((entry) => entry.name);
      });
    },
    async stat(file) {
      const value = relative(file);
      return enqueue(() => {
        const { metadata } = getEntry(value);
        return { size: metadata.size, mtimeMs: metadata.mtimeMs, mtime: new Date(metadata.mtimeMs),
          isFile: () => metadata.kind === 'file', isDirectory: () => metadata.kind === 'directory', isSymbolicLink: () => false };
      });
    },
    async unlink(file) {
      const value = relative(file);
      return enqueue(async () => {
        const entry = getEntry(value);
        if (entry.metadata.kind !== 'file') throw failure('EISDIR');
        await view.remove(entry.objectId, 'account-file');
        files.delete(keyFor(value));
      });
    },
    async rename(source, destination) {
      const from = relative(source);
      const to = relative(destination);
      return enqueue(async () => {
        if (keyFor(from) === keyFor(to)) return;
        const original = getEntry(from);
        if (original.metadata.kind !== 'file') throw failure('EISDIR');
        if (files.has(keyFor(to))) throw failure('EEXIST');
        const parent = path.posix.dirname(to);
        requireDirectory(parent === '.' ? '' : parent);
        const bytes = await read(from);
        const metadata = { ...original.metadata, relativePath: to, mtimeMs: Date.now() };
        try {
          await view.put({ objectId: original.objectId, type: 'account-file', metadata, data: bytes });
        } finally { bytes.fill(0); }
        files.delete(keyFor(from));
        files.set(keyFor(to), { objectId: original.objectId, type: 'account-file', metadata });
      });
    },
  };
}

module.exports = { createAccountFiles, validateAccountRelativePath: validateRelative };
