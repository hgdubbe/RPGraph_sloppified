const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { encryptRecord, decryptRecord, maxRecordBytes } = require('./accountCrypto.cjs');

const catalogLimit = 8 * 1024 * 1024;
const catalogObjectId = '00000000-0000-0000-0000-000000000000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const catalogContext = (accountId) => ({ accountId, objectId: catalogObjectId, type: 'catalog', revision: 0 });

function validateId(id) {
  if (typeof id !== 'string' || !uuid.test(id) || id === catalogObjectId) throw new Error('Invalid account object ID.');
}

function validateType(type) {
  if (typeof type !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(type) || type === 'catalog') {
    throw new Error('Invalid account record type.');
  }
}

function validateOptions({ root, accountId, key }) {
  validateId(accountId);
  if (typeof root !== 'string' || !path.isAbsolute(root) || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('Invalid account store options.');
  }
}

async function verifyRoot(root) {
  const stat = await fs.lstat(root);
  const actual = await fs.realpath(root);
  const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalize(actual) !== normalize(root)) {
    throw new Error('Account store must be a real directory.');
  }
}

async function readBounded(root, name, limit) {
  await verifyRoot(root);
  const file = path.join(root, name);
  const before = await fs.lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error('Invalid account file.');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit || stat.ino !== before.ino || stat.dev !== before.dev) throw new Error('Invalid account file.');
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error('Account file changed during read.');
    return JSON.parse(bytes.subarray(0, offset).toString('utf8'));
  } finally {
    await handle.close();
  }
}

async function writeExclusive(root, name, bytes) {
  await verifyRoot(root);
  const handle = await fs.open(path.join(root, name), 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncRoot(root) {
  // Windows cannot open directory handles through Node fs for fsync. Atomic
  // replacement still applies; power-loss durability must be tested packaged.
  if (process.platform === 'win32') return;
  const handle = await fs.open(root, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

function encodeCatalog(accountId, key, catalog) {
  const plaintext = Buffer.from(JSON.stringify(catalog));
  try {
    if (plaintext.length > catalogLimit) throw new Error('Account catalog is too large.');
    return JSON.stringify(encryptRecord(key, catalogContext(accountId), plaintext));
  } finally {
    plaintext.fill(0);
  }
}

function validateCatalog(catalog) {
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.entries) || catalog.entries.length > 100000) {
    throw new Error('Invalid account catalog.');
  }
  const ids = new Set();
  for (const entry of catalog.entries) {
    validateId(entry.objectId);
    validateId(entry.fileId);
    validateType(entry.type);
    if (ids.has(entry.objectId) || !Number.isSafeInteger(entry.revision) || entry.revision < 1) throw new Error('Invalid account catalog.');
    ids.add(entry.objectId);
  }
  return catalog;
}

async function acquireLock(root) {
  await verifyRoot(root);
  const file = path.join(root, 'store.lock');
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify({ pid: process.pid })); await handle.sync(); }
  catch (error) { await handle.close(); await fs.unlink(file); throw error; }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await handle.close();
    await verifyRoot(root);
    await fs.unlink(file);
  };
}

function createApi(root, accountId, sourceKey, initialCatalog, initialBytes, releaseLock) {
  const key = Buffer.from(sourceKey);
  let catalog = initialCatalog;
  let catalogBytes = initialBytes;
  let closed = false;
  let closePromise;
  let queue = Promise.resolve();
  function requireOpen() { if (closed) throw new Error('Account store is closed.'); }
  function serialize(task) {
    requireOpen();
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  function summaries(entries) {
    return structuredClone(entries.map(({ objectId, type, revision, metadata }) => ({ objectId, type, revision, metadata })));
  }
  async function readStored(entries, objectId, type) {
    validateId(objectId);
    validateType(type);
    const entry = entries.find((item) => item.objectId === objectId && item.type === type);
    if (!entry) throw new Error('Account object not found.');
    const envelope = await readBounded(root, `${entry.fileId}.object`, 4 * Math.ceil(maxRecordBytes / 3) + 1024);
    return decryptRecord(key, { accountId, objectId, type, revision: entry.revision }, envelope);
  }
  return {
    list() {
      return serialize(() => summaries(catalog.entries));
    },
    get(objectId, type) {
      return serialize(() => readStored(catalog.entries, objectId, type));
    },
    snapshot() {
      return serialize(() => {
        const entries = structuredClone(catalog.entries);
        return { entries: summaries(entries), get(objectId, type) { return serialize(() => readStored(entries, objectId, type)); } };
      });
    },
    put({ objectId, type, metadata = {}, data }, { beforePublish } = {}) {
      requireOpen();
      validateId(objectId);
      validateType(type);
      if (beforePublish !== undefined && typeof beforePublish !== 'function') throw new Error('Invalid account commit guard.');
      if (!Buffer.isBuffer(data) || data.length > maxRecordBytes) throw new Error('Invalid account record size.');
      // Capture mutable inputs before returning control to the caller.
      const capturedMetadata = JSON.parse(JSON.stringify(metadata));
      const capturedData = Buffer.from(data);
      return serialize(async () => {
        try {
          beforePublish?.();
          const previous = catalog.entries.find((entry) => entry.objectId === objectId);
          if (previous && previous.type !== type) throw new Error('Account object type cannot change.');
          const revision = (previous?.revision || 0) + 1;
          if (!Number.isSafeInteger(revision)) throw new Error('Account revision exhausted.');
          const fileId = randomUUID();
          const nextEntry = { objectId, type, revision, metadata: capturedMetadata, fileId };
          const next = { version: 1, entries: [...catalog.entries.filter((entry) => entry.objectId !== objectId), nextEntry] };
          const nextBytes = encodeCatalog(accountId, key, next);
          const envelope = encryptRecord(key, { accountId, objectId, type, revision }, capturedData);
          await writeExclusive(root, `${fileId}.object`, JSON.stringify(envelope));
          const previousTemporary = `${randomUUID()}.pending`;
          await writeExclusive(root, previousTemporary, catalogBytes);
          await fs.rename(path.join(root, previousTemporary), path.join(root, 'catalog.previous'));
          await syncRoot(root);
          const temporary = `${randomUUID()}.pending`;
          await writeExclusive(root, temporary, nextBytes);
          await verifyRoot(root);
          beforePublish?.();
          await fs.rename(path.join(root, temporary), path.join(root, 'catalog'));
          catalog = next;
          catalogBytes = nextBytes;
          await syncRoot(root);
        } finally {
          capturedData.fill(0);
        }
      });
    },
    remove(objectId, type, { beforePublish } = {}) {
      validateId(objectId);
      validateType(type);
      if (beforePublish !== undefined && typeof beforePublish !== 'function') throw new Error('Invalid account commit guard.');
      return serialize(async () => {
        beforePublish?.();
        if (!catalog.entries.some((entry) => entry.objectId === objectId && entry.type === type)) throw new Error('Account object not found.');
        const next = { version: 1, entries: catalog.entries.filter((entry) => entry.objectId !== objectId) };
        const nextBytes = encodeCatalog(accountId, key, next);
        const previousTemporary = `${randomUUID()}.pending`;
        await writeExclusive(root, previousTemporary, catalogBytes);
        await fs.rename(path.join(root, previousTemporary), path.join(root, 'catalog.previous'));
        await syncRoot(root);
        const temporary = `${randomUUID()}.pending`;
        await writeExclusive(root, temporary, nextBytes);
        await verifyRoot(root);
        beforePublish?.();
        await fs.rename(path.join(root, temporary), path.join(root, 'catalog'));
        catalog = next;
        catalogBytes = nextBytes;
        await syncRoot(root);
      });
    },
    close() {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = queue.then(async () => {
        key.fill(0);
        catalog = { version: 1, entries: [] };
        catalogBytes = '';
        await releaseLock();
      });
      return closePromise;
    },
  };
}

async function createAccountStore(options) {
  validateOptions(options);
  const { root, accountId } = options;
  const key = Buffer.from(options.key);
  let releaseLock;
  try {
    await fs.mkdir(root, { mode: 0o700 });
    releaseLock = await acquireLock(root);
    const catalog = { version: 1, entries: [] };
    const bytes = encodeCatalog(accountId, key, catalog);
    await writeExclusive(root, 'catalog', bytes);
    await syncRoot(root);
    return createApi(root, accountId, key, catalog, bytes, releaseLock);
  } catch (error) {
    await releaseLock?.();
    throw error;
  } finally {
    key.fill(0);
  }
}

async function openAccountStore(options) {
  validateOptions(options);
  const { root, accountId } = options;
  const key = Buffer.from(options.key);
  let releaseLock;
  try {
    releaseLock = await acquireLock(root);
    const envelope = await readBounded(root, 'catalog', 4 * Math.ceil(catalogLimit / 3) + 1024);
    const plaintext = decryptRecord(key, catalogContext(accountId), envelope);
    try {
      return createApi(root, accountId, key, validateCatalog(JSON.parse(plaintext.toString('utf8'))), JSON.stringify(envelope), releaseLock);
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    await releaseLock?.();
    throw error;
  } finally {
    key.fill(0);
  }
}

module.exports = { createAccountStore, openAccountStore };
