const fs = require('node:fs/promises');
const path = require('node:path');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function realDirectory(directory) {
  const stat = await fs.lstat(directory);
  const actual = await fs.realpath(directory);
  const normalized = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(actual) !== normalized(directory)) throw new Error('Invalid account recovery directory.');
}

/** Only the Electron host holding its native single-instance lock may call this.
 * A PID still alive (including PID reuse) is conservatively treated as a writer. */
async function recoverAccountStoreLocks(root, { exclusiveHost } = {}) {
  if (exclusiveHost !== true) throw new Error('Account recovery requires exclusive host ownership.');
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.dirname(root) === root) throw new Error('Invalid account recovery root.');
  root = path.resolve(root);
  try { await realDirectory(root); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const account of await fs.readdir(root)) {
    if (!uuid.test(account)) continue;
    const accountRoot = path.join(root, account);
    await realDirectory(accountRoot);
    for (const generation of await fs.readdir(accountRoot)) {
      if (!uuid.test(generation)) continue;
      const directory = path.join(accountRoot, generation);
      await realDirectory(directory);
      const lock = path.join(directory, 'store.lock');
      let stat;
      try { stat = await fs.lstat(lock); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256) throw new Error('Invalid account store lock.');
      const text = await fs.readFile(lock, 'utf8');
      if (text) {
        const { pid } = JSON.parse(text);
        if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) throw new Error('Invalid account store owner.');
        try { process.kill(pid, 0); throw new Error('An account store writer is still running.'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      const current = await fs.lstat(lock);
      if (current.ino !== stat.ino || current.dev !== stat.dev || current.size !== stat.size || current.mtimeMs !== stat.mtimeMs) throw new Error('Account lock changed during recovery.');
      await fs.unlink(lock);
    }
  }
}

module.exports = { recoverAccountStoreLocks };
