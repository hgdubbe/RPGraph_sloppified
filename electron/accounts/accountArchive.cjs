const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline, finished } = require('node:stream/promises');
const yauzl = require('yauzl');
const yazl = require('yazl');
const { encryptRecord, decryptRecord, unlockKey } = require('./accountCrypto.cjs');

const limits = Object.freeze({ entries: 100000, totalBytes: 8 * 1024 ** 3,
  chunkBytes: 4 * 1024 ** 2, manifestBytes: 16 * 1024 ** 2, metadataBytes: 65536,
  headerBytes: 16384, zipBytes: 12 * 1024 ** 3, ratio: 100 });
const format = 'rpgraph-account-archive';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const chunkName = (index) => `chunks/${String(index).padStart(8, '0')}.bin`;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(JSON.stringify(value), 'utf8');
const encodedCap = (bytes) => 4 * Math.ceil(bytes / 3) + 1024;
function archiveKey(key, archiveId) {
  check(Buffer.isBuffer(key) && key.length === 32, 'Archive key is required.');
  return Buffer.from(crypto.hkdfSync('sha256', key, Buffer.from(archiveId), Buffer.from('rpgraph-account-archive:v1'), 32));
}
function context(header, index, manifest = false) {
  return { accountId: header.accountId, objectId: header.archiveId,
    type: manifest ? 'archive-manifest' : 'archive-chunk', revision: index };
}
function check(condition, message = 'Invalid account archive.') { if (!condition) throw new Error(message); }
function fields(value, names) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name)));
}
function identity(entry) {
  check(typeof entry.id === 'string' && uuid.test(entry.id));
  check(typeof entry.type === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(entry.type));
  check(Number.isSafeInteger(entry.revision) && entry.revision >= 0);
  const pending = [[entry.metadata, 0]];
  const seen = new Set();
  let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    check(++nodes <= 10000 && depth <= 16, 'Archive metadata complexity exceeds limit.');
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'string') { check(Buffer.byteLength(value) <= limits.metadataBytes, 'Archive metadata exceeds limit.'); continue; }
    if (typeof value === 'number') { check(Number.isFinite(value), 'Invalid archive metadata.'); continue; }
    check(value && typeof value === 'object' && !seen.has(value) &&
      (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype), 'Invalid archive metadata.');
    seen.add(value);
    const names = Object.keys(value);
    check(names.length + pending.length + nodes <= 10000, 'Archive metadata complexity exceeds limit.');
    for (const name of names) {
      check(Buffer.byteLength(name) <= limits.metadataBytes, 'Archive metadata exceeds limit.');
      pending.push([value[name], depth + 1]);
    }
  }
  check(json(entry.metadata).length <= limits.metadataBytes, 'Account archive metadata exceeds limit.');
}
async function* iterate(source, signal) {
  const iterator = source[Symbol.asyncIterator]?.() ?? source[Symbol.iterator]?.();
  check(iterator, 'Archive source must be iterable.');
  try {
    while (true) {
      signal?.throwIfAborted();
      let abort;
      let item;
      try {
        item = await Promise.race([Promise.resolve().then(() => iterator.next()),
          new Promise((_, reject) => {
            abort = () => reject(signal.reason);
            signal?.addEventListener('abort', abort, { once: true });
          })]);
      } finally { if (abort) signal?.removeEventListener('abort', abort); }
      if (item.done) return;
      yield item.value;
    }
  } finally {
    // An uncooperative source cannot delay cancellation or retain a writable sink.
    Promise.resolve().then(() => iterator.return?.()).catch(() => {});
  }
}
async function* chunks(source, signal) {
  let buffer = Buffer.alloc(limits.chunkBytes);
  let used = 0;
  for await (const incoming of iterate(source, signal)) {
    check(incoming instanceof Uint8Array, 'Archive data must contain byte chunks.');
    for (let offset = 0; offset < incoming.length;) {
      const count = Math.min(incoming.length - offset, buffer.length - used);
      buffer.set(incoming.subarray(offset, offset + count), used);
      used += count;
      offset += count;
      if (used === buffer.length) { yield buffer; buffer = Buffer.alloc(limits.chunkBytes); used = 0; }
    }
  }
  if (used) yield buffer.subarray(0, used);
}

/** Input comes from a main-owned snapshot. Writes a new destination only. */
async function writeAccountArchive({ destination, accountId, entries, signal, key, keyEnvelope }) {
  signal?.throwIfAborted();
  check(uuid.test(accountId));
  check((key === undefined) === (keyEnvelope === undefined), 'Both archive key and wrapper are required.');
  const header = { format, version: 1, accountId, archiveId: crypto.randomUUID(), protection: 'plain' };
  let secret;
  if (key !== undefined) {
    header.protection = 'encrypted';
    header.keyEnvelope = structuredClone(keyEnvelope);
  }
  check(json(header).length <= limits.headerBytes);
  if (key !== undefined) secret = archiveKey(key, header.archiveId);
  const temporary = `${destination}.${crypto.randomUUID()}.partial`;
  const zip = new yazl.ZipFile();
  const stopped = new AbortController();
  const workSignal = signal ? AbortSignal.any([signal, stopped.signal]) : stopped.signal;
  const output = fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
  let ownsTemporary = false;
  output.once('open', () => { ownsTemporary = true; });
  zip.on('error', (error) => zip.outputStream.destroy(error));
  const writing = pipeline(zip.outputStream, output, { signal: workSignal });
  // Attach rejection immediately; the add-entry loop also sees stream failure.
  writing.catch((error) => stopped.abort(error));
  async function add(name, bytes) {
    workSignal.throwIfAborted();
    check(!zip.outputStream.destroyed, 'Archive output closed.');
    const input = Readable.from([bytes]);
    const fail = (error) => input.destroy(error);
    zip.outputStream.once('error', fail);
    try {
      zip.addReadStream(input, name, { compress: false, mtime: new Date('2000-01-01T00:00:00Z'), mode: 0o100600 });
      await finished(input);
    } finally { zip.outputStream.off('error', fail); }
  }
  try {
    await add('header.json', json(header));
    const manifest = { format, version: 1, entries: [] };
    let manifestSize = json(manifest).length;
    const ids = new Set();
    let count = 0;
    let total = 0;
    for await (const entry of iterate(entries, workSignal)) {
      identity(entry);
      check(!ids.has(entry.id), 'Duplicate archive record.');
      ids.add(entry.id);
      check(ids.size <= limits.entries - 2, 'Archive entry limit exceeded.');
      const record = { id: entry.id, type: entry.type, revision: entry.revision,
        metadata: JSON.parse(json(entry.metadata)), chunks: [] };
      for await (const bytes of chunks(entry.data, workSignal)) {
        total += bytes.length;
        check(total <= limits.totalBytes && count < limits.entries - 2, 'Archive size limit exceeded.');
        record.chunks.push({ index: count, bytes: bytes.length, sha256: hash(bytes) });
        const stored = secret ? json(encryptRecord(secret, context(header, count), bytes)) : bytes;
        await add(chunkName(count++), stored);
      }
      manifest.entries.push(record);
      manifestSize += json(record).length + 1;
      check(manifestSize <= limits.manifestBytes, 'Archive manifest limit exceeded.');
    }
    const manifestBytes = json(manifest);
    await add('manifest.json', secret ? json(encryptRecord(secret, context(header, 0, true), manifestBytes)) : manifestBytes);
    zip.end();
    await writing;
    signal?.throwIfAborted();
    // Hard-link publication is atomic and refuses to overwrite an existing path.
    await fsp.link(temporary, destination);
  } finally {
    secret?.fill(0);
    zip.outputStream.destroy();
    await writing.catch(() => {});
    if (ownsTemporary) await fsp.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

function openZip(source) {
  return new Promise((resolve, reject) => yauzl.open(source,
    { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
    (error, zip) => error ? reject(error) : resolve(zip)));
}
async function indexZip(zip) {
  check(zip.entryCount <= limits.entries, 'Archive entry limit exceeded.');
  const entries = new Map();
  let total = 0;
  await new Promise((resolve, reject) => {
    zip.once('error', reject);
    zip.once('close', () => reject(new Error('Archive is closed.')));
    zip.once('end', resolve);
    zip.on('entry', (entry) => {
      try {
        const name = entry.fileName;
        check(name === 'header.json' || name === 'manifest.json' || /^chunks\/[0-9]{8}\.bin$/.test(name), 'Unexpected archive path.');
        check(!entries.has(name), 'Duplicate archive path.');
        check(!entry.isEncrypted() && (entry.compressionMethod === 0 || entry.compressionMethod === 8));
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        check(mode === 0 || mode === 0o100000, 'Archive links and special files are forbidden.');
        const cap = name === 'header.json' ? limits.headerBytes : encodedCap(name === 'manifest.json' ? limits.manifestBytes : limits.chunkBytes);
        check(Number.isSafeInteger(entry.uncompressedSize) && entry.uncompressedSize <= cap);
        check(entry.uncompressedSize <= Math.max(1, entry.compressedSize) * limits.ratio, 'Archive compression ratio exceeds limit.');
        total += entry.uncompressedSize;
        check(total <= limits.zipBytes, 'Archive expanded size exceeds limit.');
        entries.set(name, entry);
        zip.readEntry();
      } catch (error) { reject(error); }
    });
    zip.readEntry();
  });
  check(entries.has('header.json') && entries.has('manifest.json'));
  return entries;
}
async function readEntry(zip, entry) {
  const stream = await new Promise((resolve, reject) => zip.openReadStream(entry,
    (error, value) => error ? reject(error) : resolve(value)));
  const buffers = [];
  let length = 0;
  for await (const bytes of stream) {
    length += bytes.length;
    check(length <= entry.uncompressedSize, 'Archive entry size mismatch.');
    buffers.push(bytes);
  }
  check(length === entry.uncompressedSize, 'Archive entry size mismatch.');
  return Buffer.concat(buffers, length);
}

/** Does not expose metadata or record bytes until every record validates. */
async function openAccountArchive({ source, password, signal }) {
  signal?.throwIfAborted();
  const stat = await fsp.stat(source);
  check(stat.isFile() && stat.size <= limits.zipBytes, 'Archive file size exceeds limit.');
  const zip = await openZip(source);
  let secret;
  let closed = false;
  const close = () => { closed = true; secret?.fill(0); zip.close(); signal?.removeEventListener('abort', close); };
  signal?.addEventListener('abort', close, { once: true });
  try {
    signal?.throwIfAborted();
    check(zip.fileSize <= limits.zipBytes, 'Archive file size exceeds limit.');
    const indexed = await indexZip(zip);
    signal?.throwIfAborted();
    const header = JSON.parse(await readEntry(zip, indexed.get('header.json')));
    fields(header, ['format', 'version', 'accountId', 'archiveId', 'protection', ...(header.protection === 'encrypted' ? ['keyEnvelope'] : [])]);
    check(header.format === format && header.version === 1 && ['plain', 'encrypted'].includes(header.protection) &&
      uuid.test(header.accountId) && uuid.test(header.archiveId));
    if (header.protection === 'encrypted') {
      const unlocked = await unlockKey(header.keyEnvelope, password, header.accountId);
      try { signal?.throwIfAborted(); secret = archiveKey(unlocked, header.archiveId); } finally { unlocked.fill(0); }
    }
    const storedManifest = await readEntry(zip, indexed.get('manifest.json'));
    const manifestBytes = secret ? decryptRecord(secret, context(header, 0, true), JSON.parse(storedManifest)) : storedManifest;
    check(manifestBytes.length <= limits.manifestBytes);
    const manifest = JSON.parse(manifestBytes);
    fields(manifest, ['format', 'version', 'entries']);
    check(manifest.format === format && manifest.version === 1 && Array.isArray(manifest.entries) && manifest.entries.length <= limits.entries - 2);
    const records = new Map();
    let count = 0;
    let total = 0;
    for (const entry of manifest.entries) {
      fields(entry, ['id', 'type', 'revision', 'metadata', 'chunks']);
      identity(entry);
      check(!records.has(entry.id) && Array.isArray(entry.chunks));
      for (const chunk of entry.chunks) {
        fields(chunk, ['index', 'bytes', 'sha256']);
        check(chunk.index === count++ && Number.isSafeInteger(chunk.bytes) && chunk.bytes > 0 && chunk.bytes <= limits.chunkBytes &&
          typeof chunk.sha256 === 'string' && /^[0-9a-f]{64}$/.test(chunk.sha256));
        total += chunk.bytes;
        check(total <= limits.totalBytes && indexed.has(chunkName(chunk.index)));
      }
      records.set(entry.id, entry);
    }
    check(indexed.size === count + 2, 'Archive contains unreferenced entries.');
    async function* read(id) {
      check(!closed && records.has(id), 'Archive closed or unknown record.');
      for (const chunk of records.get(id).chunks) {
        signal?.throwIfAborted();
        check(!closed, 'Archive is closed.');
        const stored = await readEntry(zip, indexed.get(chunkName(chunk.index)));
        const bytes = secret ? decryptRecord(secret, context(header, chunk.index), JSON.parse(stored)) : stored;
        check(bytes.length === chunk.bytes && hash(bytes) === chunk.sha256, 'Archive chunk integrity failed.');
        signal?.throwIfAborted();
        check(!closed, 'Archive is closed.');
        yield bytes;
      }
    }
    for (const id of records.keys()) { for await (const unused of read(id)) { void unused; } }
    signal?.throwIfAborted();
    return { accountId: header.accountId, protection: header.protection,
      entries: manifest.entries.map(({ id, type, revision, metadata }) => ({ id, type, revision, metadata: structuredClone(metadata) })),
      read, close };
  } catch (error) { close(); throw error; }
}

/** Deliberate plaintext export only; source is never modified. */
async function decryptAccountArchive({ source, destination, password, signal }) {
  const archive = await openAccountArchive({ source, password, signal });
  try {
    await writeAccountArchive({ destination, accountId: archive.accountId, signal,
      entries: archive.entries.map((entry) => ({ ...entry, data: archive.read(entry.id) })) });
  } finally { archive.close(); }
}

module.exports = { writeAccountArchive, openAccountArchive, decryptAccountArchive };
