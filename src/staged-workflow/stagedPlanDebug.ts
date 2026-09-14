import type { CompiledTurnPlan } from './compileTurnPlan';
import type { StageRunState } from './scheduler';
import type { StagedTurnResult } from './runLiveStagedTurn';

type StagedPlanDebugStage = {
  id: string;
  recipeId: string;
  key: string;
  actorId: string;
  outputKind: string;
  dependencies: string[];
  status?: string;
  error?: string;
};

type StagedPlanDebugBeat = {
  id: string;
  speakerId?: string;
  contentCount: number;
  requiresReceiptCount: number;
};

export type StagedPlanDebugSnapshot = {
  status: StagedTurnResult['status'];
  issues?: Array<{ path: string; message: string }>;
  attempts?: number;
  error?: string;
  incompleteBeatIds?: string[];
  executionOrder?: string[];
  stages?: StagedPlanDebugStage[];
  beats?: StagedPlanDebugBeat[];
  /** decision-v1 only (S13) — every real LLM call this turn and every block dropped along the
   * way, so a silently-vanished block (bad target, failed generation, over the activeness cap)
   * has an actual visible trace instead of only a dev-console warning. */
  debugCalls?: Array<{ label: string; prompt: string; response: string }>;
  debugWarnings?: string[];
};

function stageDebugFromPlan(plan: CompiledTurnPlan, runStages?: StageRunState[]): StagedPlanDebugStage[] {
  const runStateById = new Map((runStages ?? []).map((stage) => [stage.stageId, stage]));
  return plan.stages.map((stage) => {
    const runState = runStateById.get(stage.id);
    return {
      id: stage.id,
      recipeId: stage.recipeId,
      key: stage.key,
      actorId: stage.actorId,
      outputKind: stage.output.kind,
      dependencies: stage.dependencies.map((dependency) => dependency.stageId),
      ...(runState?.status ? { status: runState.status } : {}),
      ...(runState?.error ? { error: runState.error } : {}),
    };
  });
}

function beatDebugFromPlan(plan: CompiledTurnPlan): StagedPlanDebugBeat[] {
  return plan.beats.map((beat) => ({
    id: beat.id,
    ...(beat.speakerId ? { speakerId: beat.speakerId } : {}),
    contentCount: beat.content.length,
    requiresReceiptCount: beat.requiresReceipts.length,
  }));
}

/** Turns one `StagedTurnResult` (whichever status it settled at) into the flat, serializable
 * shape the Output node's read-only "Staged Plan" viewer renders — reusing exactly the
 * `CompiledTurnPlan`/`StageRunState` data the scheduler already produces (see
 * docs/handoff/2026-09-12-s9-editor-scoping.md's "ordered-beat/dependency/result inspectors"). */
export function stagedPlanDebugSnapshot(result: StagedTurnResult): StagedPlanDebugSnapshot {
  if (result.status === 'compile-failed') {
    return { status: result.status, issues: result.issues, attempts: result.attempts };
  }
  return {
    status: result.status,
    ...(result.status === 'run-failed' ? { error: result.error } : {}),
    ...(result.status === 'incomplete' ? { incompleteBeatIds: result.incompleteBeatIds } : {}),
    executionOrder: result.plan.executionOrder,
    stages: stageDebugFromPlan(result.plan, result.runStages),
    beats: beatDebugFromPlan(result.plan),
    ...(result.debug?.calls.length ? { debugCalls: result.debug.calls } : {}),
    ...(result.debug?.warnings.length ? { debugWarnings: result.debug.warnings } : {}),
  };
}

export function formatStagedPlanDebug(snapshot: StagedPlanDebugSnapshot): string {
  const lines: string[] = [`Status: ${snapshot.status}`];
  if (snapshot.error) {
    lines.push(`Error: ${snapshot.error}`);
  }
  if (snapshot.issues?.length) {
    lines.push(snapshot.attempts ? `Issues (after ${snapshot.attempts} attempt${snapshot.attempts === 1 ? '' : 's'}):` : 'Issues:');
    snapshot.issues.forEach((issue) => lines.push(`  - [${issue.path}] ${issue.message}`));
  }
  if (snapshot.incompleteBeatIds?.length) {
    lines.push(`Incomplete beats: ${snapshot.incompleteBeatIds.join(', ')}`);
  }
  if (snapshot.executionOrder?.length) {
    lines.push(`Execution order: ${snapshot.executionOrder.join(' -> ')}`);
  }
  if (snapshot.stages?.length) {
    lines.push('', 'Stages:');
    snapshot.stages.forEach((stage) => {
      const dependencies = stage.dependencies.length ? ` (depends on: ${stage.dependencies.join(', ')})` : '';
      const status = stage.status ? ` [${stage.status}]` : '';
      const error = stage.error ? ` - ${stage.error}` : '';
      lines.push(`  - ${stage.recipeId}/${stage.key} (${stage.id}) actor=${stage.actorId} output=${stage.outputKind}${dependencies}${status}${error}`);
    });
  }
  if (snapshot.beats?.length) {
    lines.push('', 'Beats:');
    snapshot.beats.forEach((beat) => {
      const speaker = beat.speakerId ? ` speaker=${beat.speakerId}` : '';
      lines.push(`  - ${beat.id}${speaker} content=${beat.contentCount} requiresReceipts=${beat.requiresReceiptCount}`);
    });
  }
  if (snapshot.debugWarnings?.length) {
    lines.push('', 'Warnings (blocks dropped/skipped this turn):');
    snapshot.debugWarnings.forEach((warning) => lines.push(`  - ${warning}`));
  }
  if (snapshot.debugCalls?.length) {
    lines.push('', 'LLM calls this turn:');
    snapshot.debugCalls.forEach((call, index) => {
      lines.push(`  [${index + 1}] ${call.label}`, '  Prompt:', indentBlock(call.prompt), '  Response:', indentBlock(call.response), '');
    });
  }
  return lines.join('\n');
}

function indentBlock(text: string) {
  return text.split('\n').map((line) => `    ${line}`).join('\n');
}
