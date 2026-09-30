import { mkdtemp, readFile, readdir, rm, writeFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { writeAccountArchive, openAccountArchive, decryptAccountArchive } from './accountArchive.cjs';
import { createKeyEnvelope } from './accountCrypto.cjs';

async function* data(bytes: Buffer) { yield bytes; }
async function collect(source: AsyncIterable<Uint8Array>) {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

it('preserves a pre-existing partial file when exclusive creation fails', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  const collisionId = randomUUID();
  const accountId = randomUUID();
  const destination = path.join(dir, 'new.zip');
  const partial = `${destination}.${collisionId}.partial`;
  const existing = Buffer.from('synthetic unrelated existing file');
  await writeFile(partial, existing);
  const random = vi.spyOn(crypto, 'randomUUID').mockReturnValue(collisionId);
  try {
    await expect(writeAccountArchive({ destination, accountId, entries: [] })).rejects.toThrow();
    expect(await readFile(partial)).toEqual(existing);
    expect(await readdir(dir)).toEqual([path.basename(partial)]);
  } finally {
    random.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});

// Minimal synthetic ZIP builder allows unsafe names/attributes which normal ZIP
// writers correctly refuse. Payload CRC is irrelevant to these structural tests.
function fixtureZip(entries: { name: string; bytes?: Buffer; mode?: number; expanded?: number; method?: number }[]) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const bytes = entry.bytes ?? Buffer.alloc(0);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(entry.method ?? 0, 8);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(entry.expanded ?? bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, bytes);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(entry.method ?? 0, 10);
    record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(entry.expanded ?? bytes.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(((entry.mode ?? 0o100600) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42); central.push(record, name);
    offset += header.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

it.each([
  [{ name: '../escape' }], [{ name: 'C:/escape' }], [{ name: '\\\\host\\share' }],
  [{ name: 'header.json:secret' }], [{ name: 'CON' }], [{ name: 'Header.json' }],
  [{ name: 'header.json' }, { name: 'header.json' }],
  [{ name: 'header.json', mode: 0o120777 }],
  [{ name: 'header.json', bytes: Buffer.from('x'), method: 8, expanded: 16000 }],
  [{ name: 'header.json', bytes: Buffer.from('x'), method: 8, expanded: 20000 }],
].map((entries, index) => ({ entries, expected: [
  /invalid relative path|absolute path|invalid characters|Unexpected archive path/,
  /invalid relative path|absolute path|invalid characters|Unexpected archive path/,
  /invalid relative path|absolute path|invalid characters|Unexpected archive path/,
  /Unexpected archive path/, /Unexpected archive path/, /Unexpected archive path/,
  /Duplicate archive path/, /links and special files/, /compression ratio/, /^Invalid account archive\.$/,
][index] })))('rejects hostile ZIP paths, duplicate names, links or declared resource abuse (%#)', async ({ entries, expected }) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const source = path.join(dir, 'hostile.zip');
    await writeFile(source, fixtureZip(entries));
    await expect(openAccountArchive({ source })).rejects.toThrow(expected);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('runs the standalone decrypt CLI with a password on stdin and no password in output', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const source = path.join(dir, 'secret.zip');
    const destination = path.join(dir, 'plain.zip');
    const password = 'synthetic-cli-password';
    const accountId = randomUUID();
    const { key, envelope } = await createKeyEnvelope(password, accountId);
    await writeAccountArchive({ destination: source, accountId, key, keyEnvelope: envelope, entries: [] });
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/decrypt-account.mjs', '--password-stdin', source, destination], { windowsHide: true });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
      child.stdin.end(password + '\n');
    });
    expect(result.code).toBe(0);
    expect(result.output).not.toContain(password);
    const archive = await openAccountArchive({ source: destination });
    archive.close(); key.fill(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it.each(['SIGINT', 'SIGTERM'])('cleans plaintext CLI output on a handled %s cancellation', async (signal) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  const accountId = randomUUID();
  const password = 'synthetic cancellation password';
  const { key, envelope } = await createKeyEnvelope(password, accountId);
  try {
    const source = path.join(dir, 'protected.zip');
    const destination = path.join(dir, 'plain.zip');
    await writeAccountArchive({ destination: source, accountId, key, keyEnvelope: envelope, entries: [] });
    const originalSource = await readFile(source);
    // Emit the process signal event when the output has actually been created.
    // Windows child.kill() is a forced termination, not a graceful signal event.
    const bootstrap = `
      const fs = require('node:fs');
      const original = fs.createWriteStream;
      const source = process.argv[1], destination = process.argv[2], signal = process.argv[3];
      process.argv = [process.execPath, 'scripts/decrypt-account.mjs', '--password-stdin', source, destination];
      fs.createWriteStream = ((create) => (...args) => {
        const stream = create(...args);
        stream.once('open', () => process.emit(signal));
        return stream;
      })(original);
      import('./scripts/decrypt-account.mjs');
    `;
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', bootstrap, source, destination, signal], { windowsHide: true });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
      child.stdin.end(password + '\n');
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/cancel/i);
    expect(result.output).not.toContain(password);
    expect(await readdir(dir)).toEqual(['protected.zip']);
    expect(await readFile(source)).toEqual(originalSource);
  } finally { key.fill(0); await rm(dir, { recursive: true, force: true }); }
});

it('rejects changed source bytes on later reads even after full initial verification', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const source = path.join(dir, 'mutable.zip');
    const id = randomUUID();
    const payload = Buffer.from('synthetic-source-mutation-canary');
    await writeAccountArchive({ destination: source, accountId: randomUUID(),
      entries: [{ id, type: 'settings', revision: 0, metadata: {}, data: data(payload) }] });
    const archive = await openAccountArchive({ source });
    try {
      const bytes = await readFile(source);
      const offset = bytes.indexOf(payload);
      expect(offset).toBeGreaterThan(0);
      const file = await open(source, 'r+');
      try { await file.write(Buffer.from('X'), 0, 1, offset); } finally { await file.close(); }
      await expect(collect(archive.read(id))).rejects.toThrow('integrity');
    } finally { archive.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('captures entry metadata before asynchronous data and handles early destination failures', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const destination = path.join(dir, 'snapshot.zip');
    const id = randomUUID();
    const metadata = { name: 'original' };
    async function* mutatingData() { metadata.name = 'changed'; yield Buffer.from('synthetic'); }
    await writeAccountArchive({ destination, accountId: randomUUID(), entries: [
      { id, type: 'settings', revision: 0, metadata, data: mutatingData() },
    ] });
    const archive = await openAccountArchive({ source: destination });
    try { expect(archive.entries[0].metadata).toEqual({ name: 'original' }); }
    finally { archive.close(); }
    await expect(writeAccountArchive({ destination: path.join(dir, 'absent', 'fail.zip'), accountId: randomUUID(), entries: [] })).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['snapshot.zip']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('decrypts to an independently readable canonical ZIP and refuses to overwrite destinations', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const source = path.join(dir, 'encrypted.zip');
    const destination = path.join(dir, 'plain.zip');
    const accountId = randomUUID();
    const { key, envelope } = await createKeyEnvelope('synthetic password', accountId);
    const id = randomUUID();
    await writeAccountArchive({ destination: source, accountId, key, keyEnvelope: envelope,
      entries: [{ id, type: 'settings', revision: 0, metadata: {}, data: data(Buffer.from('synthetic portable settings')) }] });
    await decryptAccountArchive({ source, destination, password: 'synthetic password' });
    const plaintext = await openAccountArchive({ source: destination });
    try { expect((await collect(plaintext.read(id))).toString()).toBe('synthetic portable settings'); }
    finally { plaintext.close(); }
    const original = await readFile(destination);
    await expect(decryptAccountArchive({ source, destination, password: 'synthetic password' })).rejects.toThrow();
    expect((await readFile(destination)).equals(original)).toBe(true);
    expect((await readdir(dir)).sort()).toEqual(['encrypted.zip', 'plain.zip']);
    key.fill(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('round-trips canonical plaintext records and binary metadata without filesystem extraction', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const destination = path.join(dir, 'account.zip');
    const id = randomUUID();
    await writeAccountArchive({ destination, accountId: randomUUID(), entries: [
      { id, type: 'image', revision: 0, metadata: { name: 'synthetic image' }, data: data(Buffer.from([0, 255, 1])) },
    ] });
    expect((await readFile(destination)).subarray(0, 2).toString()).toBe('PK');
    const archive = await openAccountArchive({ source: destination });
    try {
      expect(archive.entries[0].metadata).toEqual({ name: 'synthetic image' });
      expect(await collect(archive.read(id))).toEqual(Buffer.from([0, 255, 1]));
    } finally { archive.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('rejects excessive metadata depth without publishing or leaving partial output', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    let metadata: unknown = 'synthetic';
    for (let i = 0; i < 20; i++) metadata = { nested: metadata };
    await expect(writeAccountArchive({ destination: path.join(dir, 'deep.zip'), accountId: randomUUID(), entries: [
      { id: randomUUID(), type: 'settings', revision: 0, metadata, data: data(Buffer.alloc(0)) },
    ] })).rejects.toThrow('metadata');
    expect(await readdir(dir)).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('cancels a stalled input promptly and removes only its unpublished partial output', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const controller = new AbortController();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    async function* stalled() { started(); await new Promise(() => {}); yield Buffer.alloc(0); }
    const writing = writeAccountArchive({ destination: path.join(dir, 'cancel.zip'), accountId: randomUUID(), signal: controller.signal,
      entries: [{ id: randomUUID(), type: 'media', revision: 0, metadata: {}, data: stalled() }] });
    const rejected = expect(writing).rejects.toThrow();
    await entered;
    controller.abort();
    await rejected;
    expect(await readdir(dir)).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('exports protected chunks and private metadata without plaintext and validates before exposing records', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rpgraph-archive-test-'));
  try {
    const destination = path.join(dir, 'protected.zip');
    const accountId = randomUUID();
    const { key, envelope } = await createKeyEnvelope('synthetic password', accountId);
    const id = randomUUID();
    const bytes = Buffer.alloc(4 * 1024 ** 2 + 23, 42);
    Buffer.from('PRIVATE-ARCHIVE-CANARY').copy(bytes);
    await writeAccountArchive({ destination, accountId, key, keyEnvelope: envelope, entries: [
      { id, type: 'image', revision: 0, metadata: { name: 'PRIVATE-ARCHIVE-METADATA' }, data: data(bytes) },
    ] });
    const file = await readFile(destination);
    expect(file.includes(Buffer.from('PRIVATE-ARCHIVE-CANARY'))).toBe(false);
    expect(file.includes(Buffer.from('PRIVATE-ARCHIVE-METADATA'))).toBe(false);
    await expect(openAccountArchive({ source: destination, password: 'wrong' })).rejects.toThrow();
    const archive = await openAccountArchive({ source: destination, password: 'synthetic password' });
    try { expect((await collect(archive.read(id))).equals(bytes)).toBe(true); }
    finally { archive.close(); key.fill(0); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
