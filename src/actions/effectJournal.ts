import type { ActionScope } from './contracts';
import type { JournalAdapter } from './runtime';

/**
 * Thin IPC-backed implementation of `runtime.ts`'s `JournalAdapter`, durably recording
 * real effects via the Electron main process (`electron/ipc/effectJournal.cjs`). See
 * docs/superpowers/plans/2026-09-06-code-quality-cleanup.md §H7.
 */
export function createLiveEffectJournal(): JournalAdapter {
  return {
    recordAttempt: (input) => window.rpgraph.recordEffectJournalAttempt(input),
    recordOutcome: (input) => window.rpgraph.recordEffectJournalOutcome(input.operationId, {
      status: input.status,
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
    }),
  };
}

/** Clears journal entries for one turn attempt once its commit has actually landed. */
export function clearEffectJournalForScope(scope: ActionScope): Promise<void> {
  return window.rpgraph.clearEffectJournal(scope);
}
