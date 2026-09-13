import { hardLimits } from './compileTurnPlan';
import type { WorkflowNodeData } from '../types';

export const defaultStagedBeatsLimit = 32;
export const defaultStagedCallsLimit = 8;
export const defaultStagedGenerationsLimit = 4;
export const defaultStagedContinuationsLimit = 0;

function clampToHardLimit(value: number | undefined, fallback: number, cap: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(cap, Math.max(0, Math.round(value)));
}

/**
 * Route-authored per-turn budget (S9), including continuation planning: `continuations` is how
 * many extra plan+run rounds the model may request beyond the first when one round can't fit the
 * whole scene (see `runLiveStagedTurn.ts`'s round loop) — 0 by default, matching the pre-existing
 * behavior of every route that never opts in. Every field is clamped into the compiler's own hard
 * limits so a stray UI value can never make `validatePlanEnvironment` throw instead of failing
 * gracefully as `compile-failed`.
 */
export function resolveStagedLimits(
  data: Pick<WorkflowNodeData, 'stagedBeatsLimit' | 'stagedCallsLimit' | 'stagedGenerationsLimit' | 'stagedContinuationsLimit'>,
) {
  return {
    beats: clampToHardLimit(data.stagedBeatsLimit, defaultStagedBeatsLimit, hardLimits.beats),
    calls: clampToHardLimit(data.stagedCallsLimit, defaultStagedCallsLimit, hardLimits.calls),
    generations: clampToHardLimit(data.stagedGenerationsLimit, defaultStagedGenerationsLimit, hardLimits.generations),
    continuations: clampToHardLimit(data.stagedContinuationsLimit, defaultStagedContinuationsLimit, hardLimits.continuations),
  };
}
