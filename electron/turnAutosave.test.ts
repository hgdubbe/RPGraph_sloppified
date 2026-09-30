import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { currentScryptParameters } from './encryptionFormat.cjs';
import * as formats from './sessionFormat.cjs';
import { createWorkspaceProtection } from './workspaceProtection.cjs';

const main = readFileSync('electron/main.cjs', 'utf8');
const slice = (start: string, end: string) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));

function harness() {
  const writes = new Map<string, string>();
  const workspaceProtection = createWorkspaceProtection();
  const handlerStart = main.indexOf("ipcMain.handle('autosave:save-turn'");
  let save!: (event: unknown, session: unknown, protection?: string, password?: string) => Promise<unknown>;
  const context = {
    ...formats, crypto, Buffer, path, currentScryptParameters, workspaceProtection,
    sessionCipherAad: Buffer.from('rpgraph-encrypted-session:v2.1'),
    filesDirectory: () => '/test', approveFilePath: (file: string) => file,
    storedFileMetadata: (value: { format: string }) => value.format === 'rpgraph-encrypted-session'
      ? formats.encryptedSessionMetadata(value) : formats.sessionMetadata(value),
    unsupportedSessionFormatError: () => new Error('Unsupported format'),
    fs: {
      mkdir: vi.fn(async () => {}),
      readFile: async (file: string) => writes.get(file),
      stat: async (file: string) => {
        if (!writes.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
        const mtimeMs = [...writes.keys()].indexOf(file) + 1;
        return { mtimeMs, mtime: new Date(mtimeMs) };
      },
    },
    writeTextFileAtomically: async (file: string, content: string) => { writes.set(file, content); },
    ipcMain: { handle: (_name: string, fn: typeof save) => { save = fn; } },
  };
  const api = runInNewContext([
    slice('const turnAutosaveFileNames =', 'function unsupportedSessionFormatError'),
    slice('async function deriveFileKey(', 'async function encryptWorkflow('),
    slice('async function decryptSession(', 'async function decryptWorkflow('),
    main.slice(handlerStart, main.indexOf('\n});', handlerStart) + 4),
    '({ listTurnAutosaveFiles, decryptSession })',
  ].join('\n'), context);
  return { save, writes, workspaceProtection, ...api };
}

const session = {
  format: 'rpgraph-session', formatVersion: formats.currentSessionFormatVersion,
  savedAt: '2026-01-01', name: 'Private test story',
  workflow: { format: 'rpgraph-workflow', formatVersion: formats.currentSessionWorkflowFormatVersion, graph: { nodes: [], edges: [] } },
  timeline: [], metadata: {}, entities: {}, runtime: { current: { workflowVariables: {} } }, ui: {},
};

it('rotates encrypted slots, lists them locked, and restores with the existing password format', async () => {
  const { save, writes, listTurnAutosaveFiles, decryptSession } = harness();
  await save({}, session, 'encrypted', 'test-secret');
  await save({}, session, 'encrypted', 'test-secret');
  expect(writes.size).toBe(2);
  for (const content of writes.values()) {
    expect(content).not.toContain(session.name);
    expect(content).not.toContain('test-secret');
    const envelope = JSON.parse(content);
    expect(envelope.format).toBe('rpgraph-encrypted-session');
    expect(await decryptSession(envelope, 'test-secret')).toEqual(session);
    await expect(decryptSession(envelope, 'wrong')).rejects.toThrow('Unable to unlock');
  }
  const choices = await listTurnAutosaveFiles();
  expect(choices).toHaveLength(2);
  expect(choices.every((choice: { value: unknown; protection: string }) => choice.value === null && choice.protection === 'encrypted')).toBe(true);
  await save({}, { ...session, name: 'Next turn' }, 'encrypted', 'test-secret');
  expect(writes.size).toBe(2);
});

it('never writes plaintext when encryption lacks a password or workspace protection forbids it', async () => {
  const { save, writes, workspaceProtection } = harness();
  await expect(save({}, session, 'encrypted', '')).rejects.toThrow('password or PIN');
  expect(writes.size).toBe(0);
  workspaceProtection.activate('secret');
  await expect(save({}, session, 'plain', '')).rejects.toThrow('same game password');
  expect(writes.size).toBe(0);
});

it('keeps existing plaintext slots available alongside encrypted slots', async () => {
  const { save, listTurnAutosaveFiles } = harness();
  await save({}, session);
  await save({}, session, 'encrypted', 'secret');
  const choices = await listTurnAutosaveFiles();
  expect(choices).toHaveLength(2);
  expect(choices.find((choice: { protection: string }) => choice.protection === 'plain').value).toEqual(session);
  expect(choices.find((choice: { protection: string }) => choice.protection === 'encrypted').value).toBeNull();
});
