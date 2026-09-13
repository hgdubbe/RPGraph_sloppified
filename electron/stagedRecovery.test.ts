import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const stagedRecovery = await import('./ipc/stagedRecovery.cjs');

describe('staged recovery', () => {
  it('starts empty for a session that has never had an interrupted turn', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-staged-recovery-'));
    try {
      expect(await stagedRecovery.readStagedRecoveryForSession('rp.json', { directory })).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes and reads back a durable record for one session', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-staged-recovery-'));
    try {
      const retry = { plan: { version: 'staged-v1' }, store: { records: [] }, completedStageIds: ['s1'], outputs: {} };
      await stagedRecovery.writeStagedRecoveryForSession('rp.json', retry, 'Stage failed.', { directory });
      const entry = await stagedRecovery.readStagedRecoveryForSession('rp.json', { directory });
      expect(entry).toMatchObject({ sessionFileName: 'rp.json', retry, error: 'Stage failed.' });
      expect(typeof entry.recordedAt).toBe('string');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('re-writing the same session replaces rather than duplicates', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-staged-recovery-'));
    try {
      await stagedRecovery.writeStagedRecoveryForSession('rp.json', { completedStageIds: [] }, 'first', { directory });
      await stagedRecovery.writeStagedRecoveryForSession('rp.json', { completedStageIds: ['s1'] }, 'second', { directory });
      const entry = await stagedRecovery.readStagedRecoveryForSession('rp.json', { directory });
      expect(entry.retry).toEqual({ completedStageIds: ['s1'] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps separate sessions independent', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-staged-recovery-'));
    try {
      await stagedRecovery.writeStagedRecoveryForSession('a.json', { completedStageIds: ['a'] }, 'a failed', { directory });
      await stagedRecovery.writeStagedRecoveryForSession('b.json', { completedStageIds: ['b'] }, 'b failed', { directory });
      expect((await stagedRecovery.readStagedRecoveryForSession('a.json', { directory })).retry).toEqual({ completedStageIds: ['a'] });
      expect((await stagedRecovery.readStagedRecoveryForSession('b.json', { directory })).retry).toEqual({ completedStageIds: ['b'] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('clears only the named session, leaving others intact', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-staged-recovery-'));
    try {
      await stagedRecovery.writeStagedRecoveryForSession('a.json', { completedStageIds: ['a'] }, 'a failed', { directory });
      await stagedRecovery.writeStagedRecoveryForSession('b.json', { completedStageIds: ['b'] }, 'b failed', { directory });
      await stagedRecovery.clearStagedRecoveryForSession('a.json', { directory });
      expect(await stagedRecovery.readStagedRecoveryForSession('a.json', { directory })).toBeNull();
      expect(await stagedRecovery.readStagedRecoveryForSession('b.json', { directory })).not.toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('clearing an already-empty/non-matching session is a harmless no-op', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-staged-recovery-'));
    try {
      await stagedRecovery.clearStagedRecoveryForSession('missing.json', { directory });
      expect(await stagedRecovery.readStagedRecoveryForSession('missing.json', { directory })).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
