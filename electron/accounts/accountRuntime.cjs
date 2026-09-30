const path = require('node:path');
const { createAccountFiles } = require('./accountFiles.cjs');
const { currentStorage, runWithStorage } = require('./accountIPC.cjs');

function within(root, target) {
  const relative = path.relative(root, target);
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** All application-owned private paths are virtual; no plaintext disk fallback. */
function createAccountRuntime({ userDataPath, nativeFs = require('node:fs/promises') }) {
  const dataRoot = path.resolve(userDataPath);
  const virtualRoot = path.join(dataRoot, 'account-workspaces');
  const sessions = new WeakMap();
  function current() {
    const view = currentStorage();
    const state = sessions.get(view.signal);
    if (!state) throw new Error('Account workspace is not ready.');
    return state;
  }
  function select(file, writing) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) throw new Error('Invalid storage path.');
    const target = path.resolve(file);
    // Window geometry is deliberately public and needed before authentication.
    if (target === path.join(dataRoot, 'window-state.json')) return nativeFs;
    const state = current();
    if (within(virtualRoot, target)) {
      if (!state.files.contains(target)) throw new Error('Path belongs to a different account.');
      return state.files;
    }
    if (within(dataRoot, target)) throw new Error('Legacy local data requires explicit migration.');
    if (writing) throw new Error('Save inside the account or use account export.');
    return nativeFs;
  }
  const fs = {};
  for (const method of ['readFile', 'readdir', 'stat', 'mkdir', 'writeFile', 'unlink']) {
    fs[method] = async (file, ...args) => select(file, ['mkdir', 'writeFile', 'unlink'].includes(method))[method](file, ...args);
  }
  fs.rename = async (from, to) => {
    const source = select(from, true);
    if (source !== select(to, true)) throw new Error('Cannot move files outside the account.');
    return source.rename(from, to);
  };
  return {
    fs,
    root: () => current().files.root,
    files: () => current().files,
    services: () => current().services,
    isVirtual: (file) => typeof file === 'string' && path.isAbsolute(file) && within(virtualRoot, path.resolve(file)),
    async activate(view, createServices) {
      view.assertCurrent();
      const root = path.join(virtualRoot, view.account.id);
      if (path.dirname(root) !== virtualRoot) throw new Error('Invalid account workspace.');
      const files = await createAccountFiles({ root, view });
      const state = { files, services: undefined };
      sessions.set(view.signal, state);
      try {
        state.services = await runWithStorage(view, () => createServices({ root, files, view }));
      } catch (error) { sessions.delete(view.signal); throw error; }
    },
    forget(view) { if (view) sessions.delete(view.signal); },
  };
}

module.exports = { createAccountRuntime };
