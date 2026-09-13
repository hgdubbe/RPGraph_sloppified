import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const journal = await import('./ipc/effectJournal.cjs');

const scopeA = { saveId: 'save', branchId: 'branch', turnId: 'turn-a' };
const scopeB = { saveId: 'save', branchId: 'branch', turnId: 'turn-b' };

describe('effect journal', () => {
  it('starts empty and records an attempt as pending', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-journal-'));
    try {
      expect(await journal.readEffectJournal({ directory })).toEqual([]);
      await journal.recordEffectAttempt({ operationId: 'op-1', scope: scopeA, actionType: 'messenger.send' }, { directory });
      const entries = await journal.readEffectJournal({ directory });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ operationId: 'op-1', scope: scopeA, actionType: 'messenger.send', status: 'pending' });
      expect(typeof entries[0].recordedAt).toBe('string');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('updates an existing entry in place when the outcome arrives', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-journal-'));
    try {
      await journal.recordEffectAttempt({ operationId: 'op-1', scope: scopeA, actionType: 'image.generate' }, { directory });
      await journal.recordEffectOutcome('op-1', { status: 'committed', result: { type: 'image.generated', artifactId: 'img-1', ownerId: 'alice' } }, { directory });
      const entries = await journal.readEffectJournal({ directory });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ operationId: 'op-1', status: 'committed', result: { artifactId: 'img-1' } });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('re-recording the same operationId replaces rather than duplicates', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-journal-'));
    try {
      await journal.recordEffectAttempt({ operationId: 'op-1', scope: scopeA, actionType: 'messenger.send' }, { directory });
      await journal.recordEffectAttempt({ operationId: 'op-1', scope: scopeA, actionType: 'messenger.send' }, { directory });
      expect(await journal.readEffectJournal({ directory })).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('clears only entries matching the given scope, leaving other turns intact', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-journal-'));
    try {
      await journal.recordEffectAttempt({ operationId: 'op-a', scope: scopeA, actionType: 'messenger.send' }, { directory });
      await journal.recordEffectAttempt({ operationId: 'op-b', scope: scopeB, actionType: 'messenger.send' }, { directory });
      await journal.clearEffectJournalForScope(scopeA, { directory });
      const entries = await journal.readEffectJournal({ directory });
      expect(entries).toHaveLength(1);
      expect(entries[0].operationId).toBe('op-b');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('clears every entry regardless of scope', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-journal-'));
    try {
      await journal.recordEffectAttempt({ operationId: 'op-a', scope: scopeA, actionType: 'messenger.send' }, { directory });
      await journal.recordEffectAttempt({ operationId: 'op-b', scope: scopeB, actionType: 'image.generate' }, { directory });
      await journal.clearAllEffectJournal({ directory });
      expect(await journal.readEffectJournal({ directory })).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('clearing an already-empty/non-matching scope is a harmless no-op', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-journal-'));
    try {
      await journal.clearEffectJournalForScope(scopeA, { directory });
      expect(await journal.readEffectJournal({ directory })).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
