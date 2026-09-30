const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { legacyFiles, legacyDirectories } = require('./accountMigration.cjs');
const { validateAccountRelativePath } = require('./accountFiles.cjs');
const { maxRecordBytes } = require('./accountCrypto.cjs');

const hash = (data) => createHash('sha256').update(data).digest('hex');
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const identity = (stat) => ({ dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs });
const sameIdentity = (stat, expected) => Object.entries(identity(stat)).every(([key, value]) => expected[key] === value);

/** Host-only receipts of exactly the bytes imported; never accepts renderer paths. */
function createLegacyCleanupPlan({ root }) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.dirname(root) === root) throw new Error('Invalid cleanup root.');
  root = path.resolve(root);
  const files = new Map();
  let retainedProtected = 0;
  let used = false;
  function checkedRelative(value) {
    const relative = validateAccountRelativePath(value);
    if (!legacyFiles.includes(relative) && !legacyDirectories.some(directory => relative.startsWith(`${directory}/`))) throw new Error('Not an imported legacy file.');
    return relative;
  }
  async function checkedPath(relative) {
    const target = path.join(root, ...relative.split('/'));
    const within = path.relative(root, target);
    if (!within || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) throw new Error('Invalid cleanup target.');
    const parts = [root];
    const segments = relative.split('/');
    for (let index = 1; index < segments.length; index++) parts.push(path.join(root, ...segments.slice(0, index)));
    for (const directory of parts) {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(directory), directory)) throw new Error('Linked cleanup directory.');
    }
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || !samePath(await fs.realpath(target), target)) throw new Error('Linked cleanup file.');
    return { target, stat };
  }
  return Object.freeze({
    record({ relativePath, data, stat }) {
      if (used) throw new Error('Cleanup receipt is closed.');
      const relative = checkedRelative(relativePath);
      if (!Buffer.isBuffer(data) || data.length !== stat.size || data.length > maxRecordBytes || !stat.isFile()) throw new Error('Invalid cleanup receipt.');
      // Preserve existing per-file encryption, including unknown future RPGraph
      // encrypted envelope versions. Other migrated app-owned files are raw data.
      let protectedFile = false;
      try { protectedFile = /^rpgraph-encrypted-/.test(JSON.parse(data.toString('utf8'))?.format); } catch { /* Binary/plain text asset. */ }
      if (protectedFile) { retainedProtected++; return; }
      if (files.has(relative)) throw new Error('Duplicate cleanup receipt.');
      files.set(relative, Object.freeze({ relativePath: relative, ...identity(stat), digest: hash(data) }));
    },
    preview() {
      return { root, retainedProtected, files: [...files.values()].map(({ relativePath, size }) => ({ relativePath, size })) };
    },
    async erase({ consent = false, assertCanDelete = () => {} } = {}) {
      if (consent !== true) throw new Error('Explicit deletion consent is required.');
      if (used) throw new Error('Cleanup receipt has already been used.');
      assertCanDelete(); used = true;
      const deleted = [];
      const skipped = [];
      for (const receipt of files.values()) {
        let handle;
        try {
          assertCanDelete();
          const { target, stat } = await checkedPath(receipt.relativePath);
          if (!sameIdentity(stat, receipt)) throw new Error('Source changed.');
          handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
          if (!sameIdentity(await handle.stat(), receipt)) throw new Error('Source changed.');
          const digest = createHash('sha256');
          const buffer = Buffer.alloc(Math.min(64 * 1024, Math.max(receipt.size, 1)));
          try {
            let offset = 0;
            while (offset < receipt.size) {
              assertCanDelete();
              const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, receipt.size - offset), offset);
              if (!bytesRead) throw new Error('Source changed.');
              digest.update(buffer.subarray(0, bytesRead)); offset += bytesRead;
            }
            if (digest.digest('hex') !== receipt.digest || !sameIdentity(await handle.stat(), receipt)) throw new Error('Source changed.');
          } finally { buffer.fill(0); }
          await handle.close(); handle = undefined;
          if (!sameIdentity((await checkedPath(receipt.relativePath)).stat, receipt)) throw new Error('Source changed.');
          assertCanDelete();
          // Only an individually validated file is unlinked. No recursive delete,
          // broad directory cleanup, trash copy or archive-source deletion.
          await fs.unlink(target);
          deleted.push(receipt.relativePath);
        } catch { skipped.push(receipt.relativePath); }
        finally { await handle?.close(); }
      }
      return { deleted, skipped, retainedProtected };
    },
  });
}

/** Native host dialogs: safe default, optional inventory, then separate consent. */
async function offerLegacyCleanup({ plan, account, preferenceKeys = [], showMessageBox, deletePreferences, openFolder, assertCanDelete = () => {} }) {
  const preview = plan.preview();
  if (!preview.files.length && !preferenceKeys.length) return;
  const warning = `After deletion, the imported data will only be accessible through account ${JSON.stringify(account.alias)} and any other copies or backups you kept. ${account.protected
    ? 'You will need this account password. If you lose it, the application cannot recover your data.'
    : 'This account has no password: anyone using this computer can open it.'} Verify the imported account and keep a backup before deleting originals. This is permanent deletion, not secure erasure.`;
  const inventory = [
    ...preview.files.map(file => `File: ${JSON.stringify(file.relativePath)} (${file.size} bytes)`),
    ...preferenceKeys.map(key => `Browser preference: ${JSON.stringify(key)}`),
  ];
  while (true) {
    assertCanDelete();
    const choice = await showMessageBox({ title: 'Existing data imported', type: 'question',
      message: 'Delete the imported, unprotected originals?',
      detail: `${warning}\n\nSource folder: ${preview.root}\n${preview.files.length} files and ${preferenceKeys.length} browser preferences are eligible. ${preview.retainedProtected} encrypted originals will be kept. Unrelated files and folders are never deleted. Changed files/preferences will be skipped.`,
      buttons: ['Keep originals', 'Review deletion list', 'Delete originals…'], defaultId: 0, cancelId: 0 });
    if (choice.response !== 1 && choice.response !== 2) return;
    if (choice.response === 1) {
      const pageSize = 15;
      let page = 0;
      const pages = Math.ceil(inventory.length / pageSize);
      while (true) {
        assertCanDelete();
        const actions = ['Back to cleanup'];
        if (page > 0) actions.push('Previous page');
        if (page + 1 < pages) actions.push('Next page');
        const review = await showMessageBox({ title: 'Review deletion list', type: 'info', message: `Deletion preview — page ${page + 1} of ${pages}`,
          detail: `Only these imported, unprotected items are eligible. No file contents or preference values are shown.\n\n${inventory.slice(page * pageSize, (page + 1) * pageSize).join('\n')}\n\nSource folder: ${preview.root}\n${preview.retainedProtected} encrypted originals will remain.`,
          buttons: actions, defaultId: 0, cancelId: 0 });
        if (!review.response || review.response < 0 || review.response >= actions.length) break;
        page += actions[review.response] === 'Previous page' ? -1 : 1;
      }
      continue;
    }
    assertCanDelete();
    const consent = await showMessageBox({ title: 'Confirm deletion of originals', type: 'warning',
      message: 'Really permanently delete these imported originals?', detail: warning,
      checkboxLabel: 'I understand that these originals will be permanently deleted and confirm deletion.', checkboxChecked: false,
      buttons: ['Keep originals', 'Permanently delete originals'], defaultId: 0, cancelId: 0 });
    if (consent.response !== 1 || consent.checkboxChecked !== true) return;
    assertCanDelete();
    const result = await plan.erase({ consent: true, assertCanDelete });
    let browser = { deleted: 0, skipped: preferenceKeys.length };
    try { assertCanDelete(); if (preferenceKeys.length && deletePreferences) browser = await deletePreferences(); } catch { /* Report retained preferences below. */ }
    const skipped = result.skipped.length + browser.skipped;
    const finished = await showMessageBox({ title: 'Check for remaining data', type: skipped ? 'warning' : 'info',
      message: skipped ? 'Cleanup is incomplete. The imported account remains available.' : 'Imported originals deleted. Check for remaining copies.',
      detail: `Deleted ${result.deleted.length} files and ${browser.deleted} browser preferences. ${skipped} items were skipped because they changed, were unavailable, or could not safely be deleted. ${result.retainedProtected} encrypted originals were kept.\n\nPlease check the source folder for remaining data. Unrelated files, folders, encrypted originals, browser caches, backups, exports and copies in other locations may remain. This was not secure erasure. Keep a verified account backup.\n\nSource folder: ${preview.root}`,
      buttons: ['Done', 'Open original folder'], defaultId: 0, cancelId: 0 });
    if (finished.response === 1 && openFolder) await openFolder(preview.root);
    // Imported contents are already published; cleanup never rolls them back.
    return;
  }
}

module.exports = { createLegacyCleanupPlan, offerLegacyCleanup };
