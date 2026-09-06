import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const diagnostics = await import('./ipc/crashDiagnostics.cjs');

describe('crash diagnostics', () => {
  it('keeps only the most recent crash records', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rpgraph-crash-'));
    try {
      for (let index = 0; index < 7; index += 1) {
        await diagnostics.appendDiagnosticLog(
          'render-process-gone',
          { reason: `reason-${index}` },
          { directory, limit: 5 },
        );
      }

      const records = await diagnostics.readRecentCrashDiagnostics({ directory });
      expect(records).toHaveLength(5);
      expect(records[0].details.reason).toBe('reason-2');
      expect(records[4].details.reason).toBe('reason-6');

      const contents = await readFile(path.join(directory, 'crash-diagnostics.json'), 'utf8');
      expect(JSON.parse(contents)).toHaveLength(5);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
