import { describe, expect, it } from 'vitest';
import type { CompiledTurnPlan } from './compileTurnPlan';
import type { StageRunState } from './scheduler';
import type { VariableStore } from './variableStore';
import { formatStagedPlanDebug, stagedPlanDebugSnapshot } from './stagedPlanDebug';
import type { StagedTurnResult } from './runLiveStagedTurn';

function fakePlan(): CompiledTurnPlan {
  return {
    version: 'staged-v1',
    context: {} as CompiledTurnPlan['context'],
    executionOrder: ['stage/m1/receipt'],
    stages: [{
      id: 'stage/m1/receipt', instanceId: 'm1', recipeId: 'whatsup.message', key: 'receipt', kind: 'execute-action',
      actorId: 'alice', visibility: { kind: 'shared' }, lockedArguments: {}, retryPolicy: 'not-enabled',
      inputs: [], output: { id: 'stage/m1/receipt/output', kind: 'receipt' },
      dependencies: [{ stageId: 'stage/m1/draft', kind: 'content' }],
    }],
    scene: [],
    beats: [{
      id: 'b1', alias: 'b1', speakerId: 'alice', visibility: { kind: 'shared' },
      content: [{ source: 'output', stageId: 'stage/m1/receipt', outputId: 'stage/m1/receipt/output', kind: 'receipt' }],
      requiresReceipts: [{ source: 'output', stageId: 'stage/m1/receipt', outputId: 'stage/m1/receipt/output', kind: 'receipt' }],
    }],
    limits: { beats: 32, calls: 8, generations: 4, continuations: 0 },
    cost: { beats: 1, calls: 1, generations: 0, continuations: 0 },
  };
}

describe('stagedPlanDebugSnapshot', () => {
  it('carries issues and attempt count for a compile-failed result', () => {
    const result: StagedTurnResult = { status: 'compile-failed', issues: [{ path: 'instances.m1', message: 'Unknown recipe.' }], attempts: 3 };
    expect(stagedPlanDebugSnapshot(result)).toEqual({ status: 'compile-failed', issues: [{ path: 'instances.m1', message: 'Unknown recipe.' }], attempts: 3 });
  });

  it('reflects per-stage run status for a run-failed result', () => {
    const plan = fakePlan();
    const runStages: StageRunState[] = [{ stageId: 'stage/m1/receipt', status: 'failed', attempts: 1, error: 'not enabled' }];
    const result: StagedTurnResult = {
      status: 'run-failed', error: 'not enabled', stages: 1, plan, runStages,
      retry: { plan, store: {} as VariableStore, completedStageIds: [], outputs: {}, priorItems: [] },
    };
    const snapshot = stagedPlanDebugSnapshot(result);
    expect(snapshot.status).toBe('run-failed');
    expect(snapshot.error).toBe('not enabled');
    expect(snapshot.stages).toEqual([{
      id: 'stage/m1/receipt', recipeId: 'whatsup.message', key: 'receipt', actorId: 'alice', outputKind: 'receipt',
      dependencies: ['stage/m1/draft'], status: 'failed', error: 'not enabled',
    }]);
    expect(snapshot.beats).toEqual([{ id: 'b1', speakerId: 'alice', contentCount: 1, requiresReceiptCount: 1 }]);
  });

  it('carries incompleteBeatIds for an incomplete result', () => {
    const plan = fakePlan();
    const result: StagedTurnResult = { status: 'incomplete', stages: 1, plan, runStages: [], incompleteBeatIds: ['b1'] };
    expect(stagedPlanDebugSnapshot(result).incompleteBeatIds).toEqual(['b1']);
  });

  it('carries decision-v1 debug calls and warnings when present (S13)', () => {
    const plan = fakePlan();
    const result: StagedTurnResult = {
      status: 'ok', stages: 1, plan, runStages: [], items: [],
      debug: { calls: [{ label: 'Decision workflow / sequence', prompt: 'p', response: 'r' }], warnings: ['Skipped whatsup-message: unknown recipient "Kai".'] },
    };
    const snapshot = stagedPlanDebugSnapshot(result);
    expect(snapshot.debugCalls).toEqual([{ label: 'Decision workflow / sequence', prompt: 'p', response: 'r' }]);
    expect(snapshot.debugWarnings).toEqual(['Skipped whatsup-message: unknown recipient "Kai".']);
  });

  it('omits debug fields entirely when there is nothing to show (empty calls/warnings, or no debug at all)', () => {
    const plan = fakePlan();
    const withEmptyDebug: StagedTurnResult = { status: 'ok', stages: 1, plan, runStages: [], items: [], debug: { calls: [], warnings: [] } };
    expect(stagedPlanDebugSnapshot(withEmptyDebug).debugCalls).toBeUndefined();
    expect(stagedPlanDebugSnapshot(withEmptyDebug).debugWarnings).toBeUndefined();
    const withoutDebug: StagedTurnResult = { status: 'ok', stages: 1, plan, runStages: [], items: [] };
    expect(stagedPlanDebugSnapshot(withoutDebug).debugCalls).toBeUndefined();
  });
});

describe('formatStagedPlanDebug', () => {
  it('renders a readable multi-line summary including status, stages and beats', () => {
    const plan = fakePlan();
    const runStages: StageRunState[] = [{ stageId: 'stage/m1/receipt', status: 'succeeded', attempts: 1 }];
    const text = formatStagedPlanDebug(stagedPlanDebugSnapshot({ status: 'ok', stages: 1, plan, runStages, items: [] }));
    expect(text).toContain('Status: ok');
    expect(text).toContain('whatsup.message/receipt');
    expect(text).toContain('[succeeded]');
    expect(text).toContain('depends on: stage/m1/draft');
    expect(text).toContain('b1 speaker=alice content=1 requiresReceipts=1');
  });

  it('renders issues and attempt count for a compile-failed snapshot', () => {
    const text = formatStagedPlanDebug({ status: 'compile-failed', issues: [{ path: 'instances.m1', message: 'Unknown recipe.' }], attempts: 3 });
    expect(text).toContain('Status: compile-failed');
    expect(text).toContain('Issues (after 3 attempts):');
    expect(text).toContain('[instances.m1] Unknown recipe.');
  });

  it('renders decision-v1 warnings and full prompt/response text for each LLM call (S13)', () => {
    const plan = fakePlan();
    const text = formatStagedPlanDebug(stagedPlanDebugSnapshot({
      status: 'ok', stages: 1, plan, runStages: [], items: [],
      debug: {
        calls: [{ label: 'Decision workflow / sequence', prompt: 'Situation: Hi', response: 'whatsup-message: Kai' }],
        warnings: ['Skipped whatsup-message: unknown recipient "Kai".'],
      },
    }));
    expect(text).toContain('Warnings (blocks dropped/skipped this turn):');
    expect(text).toContain('unknown recipient "Kai"');
    expect(text).toContain('LLM calls this turn:');
    expect(text).toContain('[1] Decision workflow / sequence');
    expect(text).toContain('Situation: Hi');
    expect(text).toContain('whatsup-message: Kai');
  });
});
