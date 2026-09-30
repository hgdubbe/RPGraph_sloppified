import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createKeyEnvelope, wrapKey, unlockKey, encryptRecord, decryptRecord, maxRecordBytes } from './accountCrypto.cjs';

it('rewraps an existing key under a new password using a key snapshot without mutating the caller buffer', async () => {
  const accountId = randomUUID();
  const original = await createKeyEnvelope('old synthetic password', accountId);
  const expected = Buffer.from(original.key);
  const pending = wrapKey(original.key, 'new synthetic password', accountId);
  original.key.fill(7);
  const envelope = await pending;
  expect(original.key).toEqual(Buffer.alloc(32, 7));
  await expect(unlockKey(envelope, 'new synthetic password', accountId)).resolves.toEqual(expected);
  await expect(unlockKey(envelope, 'old synthetic password', accountId)).rejects.toThrow();
  expected.fill(0);
  original.key.fill(0);
});

it('decodes fixed v1 vectors generated directly with Node crypto and literal AAD bytes', async () => {
  // Synthetic public fixture. Constructed without importing the production module.
  const accountId = '11111111-1111-4111-8111-111111111111';
  const expectedKey = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
  const key = await unlockKey({
    format: 'rpgraph-account-key', version: 1,
    kdf: { name: 'scrypt', N: 131072, r: 8, p: 1 },
    salt: 'ICEiIyQlJicoKSorLC0uLw==', nonce: 'MDEyMzQ1Njc4OTo7',
    tag: 'jY8o1DhN12a6oQ3RH8Chxg==', ciphertext: 'MTcLQESDLXA6FSEPdhjC2az84gdQkToHzHZ3qXMaDwg=',
  }, 'RPgraph synthetic vector 1', accountId);
  expect(key).toEqual(expectedKey);
  expect(decryptRecord(key, {
    accountId, objectId: '22222222-2222-4222-8222-222222222222', type: 'media', revision: 7,
  }, {
    format: 'rpgraph-account-record', version: 1,
    nonce: 'QEFCQ0RFRkdISUpL', tag: 'Nwiim67nkcyid5z77xNjpg==', ciphertext: '4kYuYuWVignN',
  })).toEqual(Buffer.from('00ff8041c3a90d0a00', 'hex'));
  key.fill(0);
  expectedKey.fill(0);
});

it('uses the validated invocation snapshot when caller mutates a wrapper during key derivation', async () => {
  const accountId = randomUUID();
  const { key, envelope } = await createKeyEnvelope('synthetic password', accountId);
  const pending = unlockKey(envelope, 'synthetic password', accountId);
  Object.assign(envelope, {
    version: 99, salt: 'changed salt', nonce: 'changed nonce',
    tag: 'changed tag', ciphertext: 'changed ciphertext',
  });
  Object.assign(envelope.kdf, { N: 2 ** 30 });
  const unlocked = await pending;
  expect(unlocked).toEqual(key);
  key.fill(0);
  unlocked.fill(0);
  await expect(unlockKey(envelope, 'synthetic password', accountId)).rejects.toThrow('Unsupported');
});

it('unlocks an account key and round-trips private binary content through its record context', async () => {
  const accountId = randomUUID();
  const password = 'synthetic account password';
  const context = { accountId, objectId: randomUUID(), type: 'media', revision: 0 };
  const plaintext = Buffer.from([0, 255, 128, 13, 10, 42, 0, 97]);

  const { key, envelope } = await createKeyEnvelope(password, accountId);
  const unlockedKey = await unlockKey(envelope, password, accountId);
  expect(Buffer.isBuffer(key)).toBe(true);
  expect(key.byteLength).toBe(32);
  expect(unlockedKey).toEqual(key);

  const record = encryptRecord(key, context, plaintext);
  expect(decryptRecord(unlockedKey, context, record)).toEqual(plaintext);
});

it('rejects unsupported KDF parameters and versions', async () => {
  const accountId = randomUUID();
  const { envelope } = await createKeyEnvelope('synthetic password', accountId);
  const invalid = [
    { ...envelope, version: 99 },
    { ...envelope, kdf: { ...envelope.kdf, N: 2 ** 30 } },
    { ...envelope, kdf: { ...envelope.kdf, p: 2 } },
  ];
  for (const value of invalid) {
    await expect(unlockKey(value, 'synthetic password', accountId)).rejects.toThrow('Unsupported');
  }
});

it('rejects noncanonical and oversized encoded fields with format errors', async () => {
  const accountId = randomUUID();
  const { envelope } = await createKeyEnvelope('synthetic password', accountId);
  for (const salt of [envelope.salt + '\n', '!', Buffer.alloc(17).toString('base64')]) {
    await expect(unlockKey({ ...envelope, salt }, 'synthetic password', accountId)).rejects.toThrow('encoding');
  }
  const context = { accountId, objectId: randomUUID(), type: 'settings', revision: 0 };
  const key = randomBytes(32);
  const record = encryptRecord(key, context, Buffer.from('private'));
  expect(() => decryptRecord(key, context, { ...record, version: 99 })).toThrow('Unsupported');
  expect(() => decryptRecord(key, context, { ...record, ciphertext: record.ciphertext + '\n' })).toThrow('encoding');
  expect(() => encryptRecord(key, context, Buffer.alloc(maxRecordBytes + 1))).toThrow('size');
  expect(() => decryptRecord(key, context, { ...record, ciphertext: 'A'.repeat(4 * Math.ceil(maxRecordBytes / 3) + 4) })).toThrow('encoding');
});

it('rejects the wrong password and a wrapper moved to another account', async () => {
  const accountId = randomUUID();
  const { envelope } = await createKeyEnvelope('synthetic password', accountId);
  await expect(unlockKey(envelope, 'wrong password', accountId)).rejects.toThrow();
  await expect(unlockKey(envelope, 'synthetic password', randomUUID())).rejects.toThrow();
});

it.each(['nonce', 'tag', 'ciphertext'] as const)('authenticates changed record %s bytes', (field) => {
  const key = randomBytes(32);
  const context = { accountId: randomUUID(), objectId: randomUUID(), type: 'settings', revision: 2 };
  const record = encryptRecord(key, context, Buffer.from('synthetic private settings'));
  const changed = Buffer.from(record[field], 'base64');
  changed[0] ^= 1;
  expect(() => decryptRecord(key, context, { ...record, [field]: changed.toString('base64') })).toThrow();
});

it.each(['accountId', 'objectId', 'type', 'revision'] as const)('rejects a record swapped into another %s', (field) => {
  const key = randomBytes(32);
  const context = { accountId: randomUUID(), objectId: randomUUID(), type: 'settings', revision: 2 };
  const record = encryptRecord(key, context, Buffer.from('synthetic private settings'));
  const replacement = field === 'type' ? 'media' : field === 'revision' ? 3 : randomUUID();
  expect(() => decryptRecord(key, { ...context, [field]: replacement }, record)).toThrow();
});

it('creates fresh account keys, wrapper salts and nonces, and record nonces', async () => {
  const accountId = randomUUID();
  const first = await createKeyEnvelope('synthetic password', accountId);
  const second = await createKeyEnvelope('synthetic password', accountId);
  expect(first.key).not.toEqual(second.key);
  expect(first.envelope.salt).not.toBe(second.envelope.salt);
  expect(first.envelope.nonce).not.toBe(second.envelope.nonce);
  const context = { accountId, objectId: randomUUID(), type: 'media', revision: 0 };
  const plain = Buffer.from('identical synthetic payload');
  const a = encryptRecord(first.key, context, plain);
  const b = encryptRecord(first.key, context, plain);
  expect(a.nonce).not.toBe(b.nonce);
  expect(a.ciphertext).not.toBe(b.ciphertext);
});

it.each(['', 'x'.repeat(1025), 'é'.repeat(513)])('rejects an empty or over-limit UTF-8 password (%#)', async (password) => {
  await expect(createKeyEnvelope(password, randomUUID())).rejects.toThrow('password');
});

it('rejects concurrent KDF work and permits a later unlock after the first completes', async () => {
  const accountId = randomUUID();
  const first = createKeyEnvelope('synthetic password', accountId);
  await expect(createKeyEnvelope('second synthetic password', randomUUID())).rejects.toThrow('in progress');
  const { key, envelope } = await first;
  await expect(unlockKey(envelope, 'synthetic password', accountId)).resolves.toEqual(key);
});

it.each(['nonce', 'tag', 'ciphertext'] as const)('rejects tampered key wrapper %s', async (field) => {
  const accountId = randomUUID();
  const { envelope } = await createKeyEnvelope('synthetic password', accountId);
  const changed = Buffer.from(envelope[field], 'base64');
  changed[0] ^= 1;
  await expect(unlockKey({ ...envelope, [field]: changed.toString('base64') }, 'synthetic password', accountId)).rejects.toThrow();
});

it('rejects invalid IDs, revisions, and unexpected context fields', () => {
  const key = randomBytes(32);
  const context = { accountId: randomUUID(), objectId: randomUUID(), type: 'media', revision: 0 };
  for (const invalid of [
    { ...context, accountId: '../other-account' },
    { ...context, objectId: 'not-a-uuid' },
    { ...context, revision: -1 },
    { ...context, revision: 0.5 },
    { ...context, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...context, extra: 'unexpected' },
  ]) {
    expect(() => encryptRecord(key, invalid, Buffer.from('synthetic'))).toThrow();
  }
});
