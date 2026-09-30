const crypto = require('node:crypto');

// Account format v1 is deliberately separate from the legacy per-file format.
const keyFormat = 'rpgraph-account-key';
const recordFormat = 'rpgraph-account-record';
const version = 1;
const kdf = Object.freeze({ name: 'scrypt', N: 131072, r: 8, p: 1 });
const maxRecordBytes = 64 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function requireId(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('Invalid account object ID.');
}

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid account key.');
}

function requirePassword(password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new Error('Account password must contain between 1 and 1024 UTF-8 bytes.');
  }
}

function exactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new Error('Invalid account envelope.');
  }
}

function decode(value, maxBytes, exactBytes) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3)) {
    throw new Error('Invalid account envelope encoding.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > maxBytes ||
      (exactBytes !== undefined && bytes.length !== exactBytes)) {
    throw new Error('Invalid account envelope encoding.');
  }
  return bytes;
}

function recordAad(context) {
  exactFields(context, ['accountId', 'objectId', 'type', 'revision']);
  requireId(context.accountId);
  requireId(context.objectId);
  if (typeof context.type !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(context.type) ||
      !Number.isSafeInteger(context.revision) || context.revision < 0) {
    throw new Error('Invalid account record context.');
  }
  return Buffer.from(JSON.stringify([recordFormat, version, context.accountId, context.objectId, context.type, context.revision]));
}

function wrapAad(accountId, salt) {
  return Buffer.from(JSON.stringify([keyFormat, version, accountId, kdf.name, kdf.N, kdf.r, kdf.p, salt]));
}

function seal(key, aad, plaintext) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function open(key, aad, envelope, limit, exactLength) {
  const nonce = decode(envelope.nonce, 12, 12);
  const tag = decode(envelope.tag, 16, 16);
  const ciphertext = decode(envelope.ciphertext, limit, exactLength);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  let pending;
  try {
    pending = decipher.update(ciphertext);
    const final = decipher.final();
    return Buffer.concat([pending, final]);
  } catch {
    throw new Error('Unable to authenticate account data.');
  } finally {
    pending?.fill(0);
  }
}

// Serialize the memory-heavy KDF and reject a concurrent unlock rather than
// retaining an unbounded queue of passwords. The main account API retries later.
let deriving = false;
async function derive(password, salt) {
  requirePassword(password);
  if (deriving) throw new Error('An account unlock is already in progress.');
  deriving = true;
  try {
    return await new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 },
        (error, key) => error ? reject(error) : resolve(key));
    });
  } finally {
    deriving = false;
  }
}

async function wrapKey(key, password, accountId) {
  requireKey(key);
  requireId(accountId);
  requirePassword(password);
  const salt = crypto.randomBytes(16);
  const snapshot = Buffer.from(key);
  let kek;
  try {
    kek = await derive(password, salt);
    const encodedSalt = salt.toString('base64');
    return { format: keyFormat, version, kdf: { ...kdf }, salt: encodedSalt,
      ...seal(kek, wrapAad(accountId, encodedSalt), snapshot) };
  } finally {
    snapshot.fill(0);
    kek?.fill(0);
  }
}

async function createKeyEnvelope(password, accountId) {
  requireId(accountId);
  requirePassword(password);
  const key = crypto.randomBytes(32);
  try {
    return { key, envelope: await wrapKey(key, password, accountId) };
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

async function unlockKey(envelope, password, accountId) {
  requireId(accountId);
  requirePassword(password);
  exactFields(envelope, ['format', 'version', 'kdf', 'salt', 'nonce', 'tag', 'ciphertext']);
  exactFields(envelope.kdf, ['name', 'N', 'r', 'p']);
  // Never reread caller-owned fields after the asynchronous KDF. The snapshot
  // contains only validated primitive fields, including a copied KDF descriptor.
  envelope = { ...envelope, kdf: { ...envelope.kdf } };
  exactFields(envelope.kdf, ['name', 'N', 'r', 'p']);
  if (envelope.format !== keyFormat || envelope.version !== version ||
      Object.entries(kdf).some(([name, value]) => envelope.kdf[name] !== value)) {
    throw new Error('Unsupported account encryption format.');
  }
  const salt = decode(envelope.salt, 16, 16);
  // Validate every bounded binary field before spending KDF work.
  decode(envelope.nonce, 12, 12);
  decode(envelope.tag, 16, 16);
  decode(envelope.ciphertext, 32, 32);
  const aad = wrapAad(accountId, envelope.salt);
  const kek = await derive(password, salt);
  try {
    return open(kek, aad, envelope, 32, 32);
  } finally {
    kek.fill(0);
  }
}

function encryptRecord(key, context, plaintext) {
  requireKey(key);
  const aad = recordAad(context);
  if (!Buffer.isBuffer(plaintext) || plaintext.length > maxRecordBytes) throw new Error('Invalid account record size.');
  return { format: recordFormat, version, ...seal(key, aad, plaintext) };
}

function decryptRecord(key, context, envelope) {
  requireKey(key);
  const aad = recordAad(context);
  exactFields(envelope, ['format', 'version', 'nonce', 'tag', 'ciphertext']);
  if (envelope.format !== recordFormat || envelope.version !== version) throw new Error('Unsupported account record format.');
  return open(key, aad, envelope, maxRecordBytes);
}

module.exports = { createKeyEnvelope, wrapKey, unlockKey, encryptRecord, decryptRecord, maxRecordBytes };
