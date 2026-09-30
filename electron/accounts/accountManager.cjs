const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { createKeyEnvelope, unlockKey, wrapKey } = require('./accountCrypto.cjs');
const { createAccountStore, openAccountStore } = require('./accountStore.cjs');
const { createAccountSession } = require('./accountSession.cjs');
const { writeAccountArchive, openAccountArchive } = require('./accountArchive.cjs');
const { maxRecordBytes } = require('./accountCrypto.cjs');
const { createAccountFiles, validateAccountRelativePath } = require('./accountFiles.cjs');

const defaultId = '00000000-0000-4000-8000-000000000001';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const profileLimit = 16 * 1024;
const maxAccounts = 100;

function requireId(id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw new Error('Invalid account ID.');
}

async function requireDirectory(directory) {
  const stat = await fs.lstat(directory);
  const actual = await fs.realpath(directory);
  const normalized = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(actual) !== normalized(directory)) {
    throw new Error('Account directory cannot be a link.');
  }
}

async function syncDirectory(directory) {
  // Node cannot fsync directory handles on Windows. Packaged power-loss testing
  // remains a release gate; process-crash ordering is still explicit here.
  if (process.platform === 'win32') return;
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

function requireReady(profile) {
  if (profile.pendingRemoval || profile.pendingCleanup) throw new Error('Interrupted protection change requires recovery.');
}

function hasControlCharacters(value) { return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127); }
function requireAlias(alias) {
  if (typeof alias !== 'string' || !alias.trim() || alias.length > 80 || hasControlCharacters(alias)) {
    throw new Error('Invalid public account alias.');
  }
}

function validateProfile(profile, id) {
  if (!profile || profile.format !== 'rpgraph-account' || profile.version !== 1 || profile.id !== id ||
      typeof profile.alias !== 'string' || !profile.alias.trim() || profile.alias.length > 80 ||
      hasControlCharacters(profile.alias) || !['password', 'open'].includes(profile.mode)) {
    throw new Error('Invalid account profile.');
  }
  if ((id === defaultId) !== (profile.alias.toLowerCase() === 'default')) throw new Error('Invalid shared default account.');
  requireId(profile.generation);
  const expected = ['format', 'version', 'id', 'alias', 'generation', 'mode', profile.mode === 'password' ? 'keyEnvelope' : 'unprotectedKey'];
  if (Object.hasOwn(profile, 'pendingRemoval')) {
    expected.push('pendingRemoval');
    requireId(profile.pendingRemoval);
    if (profile.mode !== 'password' || id === defaultId || profile.pendingRemoval === profile.generation) throw new Error('Invalid account protection transition.');
  }
  if (Object.hasOwn(profile, 'pendingCleanup')) {
    expected.push('pendingCleanup');
    requireId(profile.pendingCleanup);
    if (profile.mode !== 'password' || id === defaultId || profile.pendingCleanup === profile.generation || profile.pendingRemoval) throw new Error('Invalid account protection transition.');
  }
  if (Object.keys(profile).length !== expected.length || expected.some((name) => !Object.hasOwn(profile, name))) {
    throw new Error('Invalid account profile.');
  }
  if (profile.mode === 'password' ? !profile.keyEnvelope :
    typeof profile.unprotectedKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(profile.unprotectedKey) ||
    Buffer.from(profile.unprotectedKey, 'base64').toString('base64') !== profile.unprotectedKey) {
    throw new Error('Invalid account protection.');
  }
  if (id === defaultId && profile.mode !== 'password') throw new Error('Invalid shared default account.');
  return profile;
}

function publicProfile(profile) {
  const pending = profile.pendingRemoval || profile.pendingCleanup;
  return { id: profile.id, alias: profile.alias, protected: profile.mode === 'password' && !pending,
    shared: profile.id === defaultId, ...(pending ? { protectionChangePending: true } : {}) };
}

async function initializeAccountManager({ root }) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.dirname(root) === root) throw new Error('Invalid account root.');
  root = path.resolve(root);
  await requireDirectory(path.dirname(root));
  try { await fs.mkdir(root, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await requireDirectory(root);

  const session = createAccountSession();
  let active;
  let busy = false;
  let closing;
  let operationEpoch = 0;
  let operationDone = Promise.resolve();
  let operationController;

  function beginOperation() {
    busy = true;
    const epoch = ++operationEpoch;
    const controller = new AbortController();
    operationController = controller;
    let finish;
    operationDone = new Promise((resolve) => { finish = resolve; });
    return {
      assertCurrent() { if (operationEpoch !== epoch) throw new Error('Account operation was cancelled.'); },
      signal: controller.signal,
      finish() { busy = false; operationController = undefined; finish(); },
    };
  }

  async function readProfile(id) {
    requireId(id);
    await requireDirectory(root);
    const directory = path.join(root, id);
    await requireDirectory(directory);
    const file = path.join(directory, 'profile.json');
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size > profileLimit) throw new Error('Invalid account profile.');
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev || stat.size > profileLimit) throw new Error('Invalid account profile.');
      const bytes = Buffer.alloc(profileLimit + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > profileLimit) throw new Error('Account profile is too large.');
      return validateProfile(JSON.parse(bytes.subarray(0, length).toString('utf8')), id);
    } finally {
      await handle.close();
    }
  }

  async function listAccounts() {
    await requireDirectory(root);
    const names = (await fs.readdir(root)).filter((name) => uuid.test(name));
    if (names.length > maxAccounts) throw new Error('Too many local accounts.');
    const profiles = [];
    for (const name of names) profiles.push(publicProfile(await readProfile(name)));
    return profiles.sort((a, b) => Number(b.shared) - Number(a.shared) || a.alias.localeCompare(b.alias));
  }

  async function replaceProfile(profile, assertCurrent) {
    const directory = path.join(root, profile.id);
    await requireDirectory(root);
    await requireDirectory(directory);
    const temporary = path.join(directory, `.profile-${randomUUID()}.pending`);
    let created = false;
    let published = false;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      created = true;
      try { await handle.writeFile(JSON.stringify(profile)); await handle.sync(); } finally { await handle.close(); }
      await requireDirectory(directory);
      assertCurrent();
      await fs.rename(temporary, path.join(directory, 'profile.json'));
      published = true;
      await syncDirectory(directory);
    } finally {
      if (created && !published) {
        // A failed password removal must not leave its public key next to the
        // copied generation while the original account still reports protected.
        try {
          await requireDirectory(root);
          await requireDirectory(directory);
          await fs.unlink(temporary);
        } catch (error) {
          // Cleanup failure deliberately takes precedence: residual key material must be reported.
          // eslint-disable-next-line no-unsafe-finally
          if (error.code !== 'ENOENT') throw new Error('Account update failed and sensitive temporary-file cleanup is incomplete.', { cause: error });
        }
      }
    }
  }

  async function createProfile(id, alias, password, assertCurrent = () => {}, populate = async () => {}) {
    const { key, envelope } = password === undefined
      ? { key: randomBytes(32), envelope: undefined } : await createKeyEnvelope(password, id);
    const staging = path.join(root, `.pending-${randomUUID()}`);
    const generation = randomUUID();
    let store;
    let stagingCreated = false;
    let published = false;
    try {
      await requireDirectory(root);
      await fs.mkdir(staging, { mode: 0o700 });
      stagingCreated = true;
      store = await createAccountStore({ root: path.join(staging, generation), accountId: id, key });
      await populate(store);
      await store.close();
      store = undefined;
      // Open profiles deliberately store their key in cleartext: the shared
      // encrypted-record codec is NOT a confidentiality promise for this mode.
      const profile = { format: 'rpgraph-account', version: 1, id, alias, generation,
        ...(envelope ? { mode: 'password', keyEnvelope: envelope } : { mode: 'open', unprotectedKey: key.toString('base64') }) };
      const handle = await fs.open(path.join(staging, 'profile.json'), 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(profile)); await handle.sync(); } finally { await handle.close(); }
      await requireDirectory(root);
      assertCurrent();
      await fs.rename(staging, path.join(root, id));
      published = true;
      await syncDirectory(root);
      return publicProfile(profile);
    } finally {
      let cleanupError;
      try { await store?.close(); } catch (error) { cleanupError = error; }
      try {
        if (stagingCreated && !published) await fs.rm(staging, { recursive: true });
      } catch (error) { cleanupError = new Error('Unpublished account cleanup is incomplete.', { cause: error }); }
      key.fill(0);
      // Surface cleanup failure even when the original publication also failed.
      // eslint-disable-next-line no-unsafe-finally
      if (cleanupError) throw cleanupError;
    }
  }

  async function markImportForReview(store, assertCurrent) {
    assertCurrent();
    // These are locally generated defaults, never trusted archive content.
    // Remove directories/descendants too so crafted fallback paths cannot deny
    // the user a clean offline session or substitute imported provider state.
    const offlinePaths = ['offline-settings.json', 'offline-browser-preferences.json', 'offline-comfy-model-state.json'];
    for (const entry of await store.list()) {
      const relative = entry.type === 'account-file' && typeof entry.metadata?.relativePath === 'string'
        ? entry.metadata.relativePath.toLowerCase() : '';
      if (offlinePaths.some((reserved) => relative === reserved || relative.startsWith(`${reserved}/`))) {
        await store.remove(entry.objectId, entry.type, { beforePublish: assertCurrent });
      }
    }
    const relativePath = 'account-import-review.json';
    const matches = (await store.list()).filter((entry) => entry.type === 'account-file'
      && typeof entry.metadata?.relativePath === 'string' && entry.metadata.relativePath.toLowerCase() === relativePath);
    if (matches.length > 1 || matches.some((entry) => entry.metadata.kind !== 'file')) throw new Error('Invalid imported account review record.');
    const data = Buffer.from('{"pending":true}');
    try {
      await store.put({ objectId: matches[0]?.objectId ?? randomUUID(), type: 'account-file',
        metadata: { relativePath, kind: 'file', size: data.length, mtimeMs: Date.now() }, data }, { beforePublish: assertCurrent });
    } finally { data.fill(0); }
  }

  try { await readProfile(defaultId); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Do not replace an existing account whose public header is missing.
    try {
      await fs.lstat(path.join(root, defaultId));
      throw new Error('Shared default account requires recovery.', { cause: error });
    } catch (directoryError) {
      if (directoryError.code !== 'ENOENT') throw directoryError;
    }
    await createProfile(defaultId, 'default', 'default');
  }

  function requireLocked() {
    if (busy || closing || session.state !== 'locked') throw new Error('Lock the current account first.');
  }

  async function privateRead(operation) {
    const lease = session.capture();
    const captured = active;
    const result = await operation(captured.store);
    try { session.assertCurrent(lease); } catch (error) {
      if (Buffer.isBuffer(result)) result.fill(0);
      throw error;
    }
    return result;
  }

  function captureStorage() {
    const lease = session.capture();
    const captured = active;
    const assertCurrent = () => session.assertCurrent(lease);
    async function read(operation) {
      assertCurrent();
      const result = await operation(captured.store);
      try { assertCurrent(); } catch (error) { if (Buffer.isBuffer(result)) result.fill(0); throw error; }
      return result;
    }
    return Object.freeze({
      account: publicProfile(captured.profile), signal: session.signal(lease), assertCurrent,
      list: () => read((store) => store.list()),
      get: (id, type) => read((store) => store.get(id, type)),
      async remove(id, type) {
        assertCurrent();
        await session.enqueuePrepared(lease, (commit) => captured.store.remove(id, type, { beforePublish: commit.assertCanCommit }));
        assertCurrent();
      },
      async put(entry) {
        assertCurrent();
        if (!Buffer.isBuffer(entry.data)) throw new Error('Invalid account data.');
        const { objectId, type } = entry;
        const metadata = structuredClone(entry.metadata ?? {});
        const data = Buffer.from(entry.data);
        try {
          await session.enqueuePrepared(lease, (commit) => captured.store.put({ objectId, type, metadata, data }, { beforePublish: commit.assertCanCommit }));
          assertCurrent();
        } finally { data.fill(0); }
      },
    });
  }

  return {
    get state() { return closing ? 'locking' : busy ? 'unlocking' : session.state; },
    captureStorage,
    listAccounts,
    async create({ alias, password }) {
      requireLocked();
      requireAlias(alias);
      alias = alias.trim();
      if (alias.toLowerCase() === 'default') throw new Error('The default account is reserved.');
      const operation = beginOperation();
      try {
        const accounts = await listAccounts();
        if (accounts.length >= maxAccounts) throw new Error('Too many local accounts.');
        if (accounts.some((account) => account.alias.toLowerCase() === alias.toLowerCase())) throw new Error('Account alias already exists.');
        operation.assertCurrent();
        return await createProfile(randomUUID(), alias, password, operation.assertCurrent);
      } finally { operation.finish(); }
    },
    async unlock(id, password) {
      requireLocked();
      const operation = beginOperation();
      let key;
      let store;
      try {
        const profile = await readProfile(id);
        requireReady(profile);
        key = profile.mode === 'password'
          ? await unlockKey(profile.keyEnvelope, password, id) : Buffer.from(profile.unprotectedKey, 'base64');
        operation.assertCurrent();
        store = await openAccountStore({ root: path.join(root, id, profile.generation), accountId: id, key });
        operation.assertCurrent();
        const lease = session.activate({ accountId: id, root: path.join(root, id, profile.generation) });
        active = { profile, key, store, lease };
        return publicProfile(profile);
      } catch (error) {
        await store?.close();
        key?.fill(0);
        throw error;
      } finally {
        operation.finish();
      }
    },
    async changeProtection(id, { currentPassword, newPassword } = {}) {
      requireLocked();
      requireId(id);
      if (id === defaultId) throw new Error('The shared default credentials cannot change.');
      const operation = beginOperation();
      let oldKey;
      let newKey;
      let source;
      let destination;
      try {
        const profile = await readProfile(id);
        requireReady(profile);
        oldKey = profile.mode === 'password'
          ? await unlockKey(profile.keyEnvelope, currentPassword, id) : Buffer.from(profile.unprotectedKey, 'base64');
        operation.assertCurrent();
        if (profile.mode === 'password' && newPassword !== undefined) {
          const keyEnvelope = await wrapKey(oldKey, newPassword, id);
          operation.assertCurrent();
          const next = { ...profile, keyEnvelope };
          await replaceProfile(next, operation.assertCurrent);
          return publicProfile(next);
        }
        if (profile.mode === 'open' && newPassword === undefined) throw new Error('Account is already unprotected.');
        // Never reuse a key that was publicly available in an open profile.
        const created = newPassword === undefined
          ? { key: randomBytes(32), envelope: undefined } : await createKeyEnvelope(newPassword, id);
        newKey = created.key;
        operation.assertCurrent();
        const directory = path.join(root, id);
        const oldRoot = path.join(directory, profile.generation);
        const generation = randomUUID();
        source = await openAccountStore({ root: oldRoot, accountId: id, key: oldKey });
        destination = await createAccountStore({ root: path.join(directory, generation), accountId: id, key: newKey });
        for (const entry of await source.list()) {
          operation.assertCurrent();
          const data = await source.get(entry.objectId, entry.type);
          try {
            await destination.put({ ...entry, data }, { beforePublish: operation.assertCurrent });
            const verified = await destination.get(entry.objectId, entry.type);
            try { if (!verified.equals(data)) throw new Error('Account conversion verification failed.'); } finally { verified.fill(0); }
          } finally { data.fill(0); }
        }
        await destination.close(); destination = undefined;
        if (newPassword === undefined) {
          // The journal is durable before any public key can appear on disk.
          // A crash from this point is an incomplete downgrade, never a claim
          // that the untouched protected profile guarantees confidentiality.
          await replaceProfile({ ...profile, pendingRemoval: generation }, operation.assertCurrent);
        }
        const next = { format: profile.format, version: profile.version, id, alias: profile.alias, generation,
          ...(created.envelope ? { mode: 'password', keyEnvelope: created.envelope }
            : { mode: 'open', unprotectedKey: newKey.toString('base64') }) };
        // An old publicly keyed generation defeats confidentiality until removed.
        // Publish its cleanup journal before claiming password protection.
        if (profile.mode === 'open') next.pendingCleanup = profile.generation;
        await replaceProfile(next, operation.assertCurrent);
        await source.close(); source = undefined;
        // Publication has succeeded. Only the validated old generation belongs
        // to this conversion; failure to remove it is reported, never hidden.
        await requireDirectory(directory);
        await requireDirectory(oldRoot);
        if (path.dirname(oldRoot) !== directory || profile.generation === generation) throw new Error('Invalid obsolete generation.');
        try { await fs.rm(oldRoot, { recursive: true, force: false }); } catch {
          throw new Error('Account protection changed, but old generation cleanup is incomplete.');
        }
        if (next.pendingCleanup) {
          await syncDirectory(directory);
          delete next.pendingCleanup;
          await replaceProfile(next, operation.assertCurrent);
        }
        return publicProfile(next);
      } finally {
        try { await destination?.close(); } finally {
          try { await source?.close(); } finally {
            oldKey?.fill(0); newKey?.fill(0); operation.finish();
          }
        }
      }
    },
    async recoverProtectionChange(id, password) {
      requireLocked();
      const operation = beginOperation();
      let key;
      try {
        const profile = await readProfile(id);
        if (!profile.pendingRemoval && !profile.pendingCleanup) throw new Error('No interrupted protection change.');
        key = await unlockKey(profile.keyEnvelope, password, id);
        operation.assertCurrent();
        const directory = path.join(root, id);
        const obsoleteGeneration = profile.pendingRemoval || profile.pendingCleanup;
        const abandoned = path.join(directory, obsoleteGeneration);
        await requireDirectory(directory);
        if (path.dirname(abandoned) !== directory || obsoleteGeneration === profile.generation) throw new Error('Invalid recovery target.');
        try {
          await requireDirectory(abandoned);
          operation.assertCurrent();
          await fs.rm(abandoned, { recursive: true, force: false });
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        for (const name of await fs.readdir(directory)) {
          if (!/^\.profile-[0-9a-f-]{36}\.pending$/.test(name)) continue;
          operation.assertCurrent();
          await requireDirectory(directory);
          // Unlink the named entry itself, never follow a possible link.
          await fs.unlink(path.join(directory, name));
        }
        await syncDirectory(directory);
        const next = { ...profile };
        delete next.pendingRemoval;
        delete next.pendingCleanup;
        await replaceProfile(next, operation.assertCurrent);
        return publicProfile(next);
      } finally { key?.fill(0); operation.finish(); }
    },
    async rename(id, alias, password) {
      requireLocked();
      requireId(id);
      requireAlias(alias);
      alias = alias.trim();
      if (id === defaultId || alias.toLowerCase() === 'default') throw new Error('The shared default account is reserved.');
      const operation = beginOperation();
      let key;
      try {
        const profile = await readProfile(id);
        requireReady(profile);
        if (profile.mode === 'password') key = await unlockKey(profile.keyEnvelope, password, id);
        operation.assertCurrent();
        if ((await listAccounts()).some((item) => item.id !== id && item.alias.toLowerCase() === alias.toLowerCase())) {
          throw new Error('Account alias already exists.');
        }
        const next = { ...profile, alias };
        await replaceProfile(next, operation.assertCurrent);
        return publicProfile(next);
      } finally { key?.fill(0); operation.finish(); }
    },
    async remove(id, password) {
      requireLocked();
      requireId(id);
      if (id === defaultId) throw new Error('The shared default account cannot be deleted.');
      const operation = beginOperation();
      let key;
      try {
        const profile = await readProfile(id);
        if (profile.mode === 'password') key = await unlockKey(profile.keyEnvelope, password, id);
        operation.assertCurrent();
        const directory = path.join(root, id);
        await requireDirectory(root);
        await requireDirectory(directory);
        if (path.dirname(directory) !== root) throw new Error('Invalid account deletion target.');
        const tombstone = path.join(root, `.deleted-${id}-${randomUUID()}`);
        operation.assertCurrent();
        await fs.rename(directory, tombstone);
        await requireDirectory(tombstone);
        if (path.dirname(tombstone) !== root) throw new Error('Invalid account deletion target.');
        try { await fs.rm(tombstone, { recursive: true, force: false }); } catch {
          throw new Error('Account removed from the list, but disk cleanup is incomplete.');
        }
      } finally { key?.fill(0); operation.finish(); }
    },
    async exportAccount(destination) {
      const lease = session.capture();
      const captured = active;
      const snapshot = await captured.store.snapshot();
      session.assertCurrent(lease);
      async function* entries() {
        for (const entry of snapshot.entries) {
          session.assertCurrent(lease);
          yield { id: entry.objectId, type: entry.type, revision: entry.revision, metadata: entry.metadata,
            data: (async function* () {
              const bytes = await snapshot.get(entry.objectId, entry.type);
              try { session.assertCurrent(lease); yield bytes; } finally { bytes.fill(0); }
            })() };
        }
      }
      await writeAccountArchive({ destination, accountId: captured.profile.id, entries: entries(), signal: session.signal(lease),
        ...(captured.profile.mode === 'password' ? { key: captured.key, keyEnvelope: captured.profile.keyEnvelope } : {}) });
      session.assertCurrent(lease);
    },
    async importFiles({ alias, password, entries, requireReview = false }) {
      requireLocked();
      requireAlias(alias);
      alias = alias.trim();
      if (alias.toLowerCase() === 'default' || !entries?.[Symbol.asyncIterator]) throw new Error('Invalid migration request.');
      const operation = beginOperation();
      try {
        const accounts = await listAccounts();
        if (accounts.length >= maxAccounts || accounts.some((account) => account.alias.toLowerCase() === alias.toLowerCase())) throw new Error('Account cannot be created.');
        return await createProfile(randomUUID(), alias, password, operation.assertCurrent, async (store) => {
          const virtualRoot = path.join(root, `.migration-view-${randomUUID()}`);
          const files = await createAccountFiles({ root: virtualRoot, view: {
            assertCurrent: operation.assertCurrent,
            list: () => store.list(), get: (id, type) => store.get(id, type),
            put: (entry) => store.put(entry, { beforePublish: operation.assertCurrent }),
          } });
          let count = 0;
          let total = 0;
          const seen = new Set();
          for await (const entry of entries) {
            operation.assertCurrent();
            const relative = validateAccountRelativePath(entry.relativePath);
            const identity = relative.toLowerCase();
            if (seen.has(identity) || !['file', 'directory'].includes(entry.kind) || !Buffer.isBuffer(entry.data) || entry.data.length > maxRecordBytes || (entry.kind === 'directory' && entry.data.length !== 0)) throw new Error('Invalid migration entry.');
            seen.add(identity);
            total += entry.data.length;
            if (++count > 100000 || total > 8 * 1024 ** 3) throw new Error('Migration exceeds supported limits.');
            const target = path.join(virtualRoot, ...relative.split('/'));
            if (entry.kind === 'directory') await files.mkdir(target, { recursive: true });
            else {
              await files.mkdir(path.dirname(target), { recursive: true });
              await files.writeFile(target, entry.data, { flag: 'wx' });
              const verified = await files.readFile(target);
              try { if (!verified.equals(entry.data)) throw new Error('Migration verification failed.'); }
              finally { verified.fill(0); }
            }
            operation.assertCurrent();
          }
          if (requireReview) await markImportForReview(store, operation.assertCurrent);
        });
      } finally { operation.finish(); }
    },
    async importAccount({ source, alias, protection, password, archivePassword, requireReview = false }) {
      requireLocked();
      requireAlias(alias);
      alias = alias.trim();
      if (alias.toLowerCase() === 'default' || !['password', 'open'].includes(protection)) throw new Error('Choose a new account and its protection.');
      if (protection === 'password' && (typeof password !== 'string' || !password)) throw new Error('A destination account password is required.');
      if (protection === 'open' && password !== undefined) throw new Error('Open accounts cannot have a password.');
      const operation = beginOperation();
      let archive;
      try {
        const accounts = await listAccounts();
        if (accounts.length >= maxAccounts || accounts.some((account) => account.alias.toLowerCase() === alias.toLowerCase())) throw new Error('Account alias already exists or account limit reached.');
        archive = await openAccountArchive({ source, password: archivePassword, signal: operation.signal });
        operation.assertCurrent();
        return await createProfile(randomUUID(), alias, password, operation.assertCurrent, async (store) => {
          for (const entry of archive.entries) {
            operation.assertCurrent();
            const chunks = [];
            let length = 0;
            try {
              for await (const chunk of archive.read(entry.id)) {
                operation.assertCurrent();
                length += chunk.length;
                if (length > maxRecordBytes) { chunk.fill(0); throw new Error('Imported account record exceeds the supported record limit.'); }
                chunks.push(chunk);
              }
              const data = Buffer.concat(chunks, length);
              try {
                await store.put({ objectId: entry.id, type: entry.type, metadata: entry.metadata, data }, { beforePublish: operation.assertCurrent });
              } finally { data.fill(0); }
            } finally { for (const chunk of chunks) chunk.fill(0); }
          }
          if (requireReview) await markImportForReview(store, operation.assertCurrent);
        });
      } finally { archive?.close(); operation.finish(); }
    },
    lock(options) {
      if (closing) return closing;
      if (busy) {
        operationEpoch += 1;
        operationController?.abort();
        closing = operationDone.finally(() => { closing = undefined; });
        return closing;
      }
      if (session.state === 'locked') return Promise.resolve();
      const captured = active;
      const drain = session.lock(options);
      closing = (async () => {
        // A deadline cannot cancel filesystem IO. Keep the manager unavailable
        // until the store has actually settled even if the session drain fails.
        try {
          await drain;
        } finally {
          try { await captured.store.close(); } finally {
            captured.key.fill(0);
            active = undefined;
          }
        }
      })().finally(() => { closing = undefined; });
      return closing;
    },
    async listRecords() { return privateRead((store) => store.list()); },
    async get(objectId, type) { return privateRead((store) => store.get(objectId, type)); },
    async put(entry) {
      const lease = session.capture();
      const captured = active;
      if (!Buffer.isBuffer(entry.data)) throw new Error('Invalid account data.');
      const metadata = structuredClone(entry.metadata ?? {});
      const data = Buffer.from(entry.data);
      const { objectId, type } = entry;
      try {
        await session.enqueuePrepared(lease, async (commit) => {
          commit.assertCanCommit();
          await captured.store.put({ objectId, type, metadata, data }, { beforePublish: commit.assertCanCommit });
        });
        session.assertCurrent(lease);
      } finally { data.fill(0); }
    },
  };
}

// This guards duplicate services inside a process. The Electron host must also
// acquire its native single-instance lock before creating any account service.
const ownedRoots = new Set();
async function createAccountManager(options) {
  if (!options || typeof options.root !== 'string' || !path.isAbsolute(options.root)) throw new Error('Invalid account root.');
  const root = path.resolve(options.root);
  const identity = process.platform === 'win32' ? root.toLowerCase() : root;
  if (ownedRoots.has(identity)) throw new Error('Account root is already owned by a manager.');
  ownedRoots.add(identity);
  try {
    const manager = await initializeAccountManager({ root });
    let disposed = false;
    let disposing;
    const service = { get state() { return disposed ? 'closed' : manager.state; } };
    for (const [name, method] of Object.entries(manager)) {
      if (typeof method !== 'function') continue;
      service[name] = async (...args) => {
        if (disposed) throw new Error('Account manager is disposed.');
        return method(...args);
      };
    }
    service.dispose = () => {
      if (!disposing) {
        disposed = true;
        disposing = Promise.resolve().then(() => manager.lock()).finally(() => { ownedRoots.delete(identity); });
      }
      return disposing;
    };
    return service;
  } catch (error) {
    ownedRoots.delete(identity);
    throw error;
  }
}

module.exports = { createAccountManager };
