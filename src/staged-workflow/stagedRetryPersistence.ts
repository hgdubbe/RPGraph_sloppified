import { VariableStore, type SerializedVariableStore } from './variableStore';
import type { StagedRetryState } from './runLiveStagedTurn';

export type SerializedStagedRetryState = {
  plan: StagedRetryState['plan'];
  store: SerializedVariableStore;
  completedStageIds: string[];
  outputs: StagedRetryState['outputs'];
  priorItems: StagedRetryState['priorItems'];
};

/**
 * S8 restart-recovery groundwork (see docs/handoff/2026-09-12-s8-restart-reconciliation-scoping.md):
 * `StagedRetryState` is otherwise plain data already (`CompiledTurnPlan`, `VariableRef`s), so the
 * only non-serializable field is `store`, a `VariableStore` instance — `serialize()`/
 * `fromSerialized()` handle that. This module only converts to/from a durable, JSON-safe shape;
 * it does not itself read or write any file — see `electron/ipc/stagedRecovery.cjs` for that.
 */
export function serializeStagedRetryState(state: StagedRetryState): SerializedStagedRetryState {
  return {
    plan: state.plan,
    store: state.store.serialize(),
    completedStageIds: state.completedStageIds,
    outputs: state.outputs,
    priorItems: state.priorItems,
  };
}

export function deserializeStagedRetryState(data: SerializedStagedRetryState): StagedRetryState {
  return {
    plan: data.plan,
    store: VariableStore.fromSerialized(data.store),
    completedStageIds: data.completedStageIds,
    outputs: data.outputs,
    priorItems: data.priorItems ?? [],
  };
}

/**
 * Thin IPC-backed wrappers, one per RP save file (`electron/ipc/stagedRecovery.cjs`),
 * mirroring `src/actions/effectJournal.ts`'s own thin-wrapper shape for the H7 effect
 * journal. `App.tsx`'s `checkStagedRecoveryForSession` consumes `readStagedRecovery` to
 * actually offer a resume prompt after an app restart (S8, second slice).
 */
export function writeStagedRecovery(sessionFileName: string, state: StagedRetryState, error: string): Promise<void> {
  return window.rpgraph.writeStagedRecovery(sessionFileName, serializeStagedRetryState(state), error);
}

export function clearStagedRecovery(sessionFileName: string): Promise<void> {
  return window.rpgraph.clearStagedRecovery(sessionFileName);
}

export async function readStagedRecovery(sessionFileName: string): Promise<{ retry: StagedRetryState; error: string } | null> {
  const entry = await window.rpgraph.readStagedRecovery(sessionFileName);
  return entry ? { retry: deserializeStagedRetryState(entry.retry), error: entry.error } : null;
}
