import type { NodeLlmApi } from '../llm/NodeLlmApi';
import type { MessageRecord, WorkflowNode } from '../types';
import { storyCharactersFromNodes } from '../storybook/runtime';
import { captureTurnContext } from './contextBuilder';
import { compileTurnPlan, type CompiledTurnPlan } from './compileTurnPlan';
import { composeReply, type ComposedItem } from './composeReply';
import { buildLiveContextSource } from './liveContextSource';
import { requestStagedPlan } from './planCall';
import { runStagedTurn } from './orchestrator';
import { stagedRecipeDefinitions } from './recipeInventory';
import { defaultStagedInstructionsText } from './stagedInstructionsPrompt';
import { resolveStagedLimits } from './stagedLimits';
import type { StagedActionBridge } from './stagedActionAdapter';
import type { StageExecutionInput, StagedSchedulerAdapters, StageRunState } from './scheduler';
import type { VariableRef } from './contracts';
import type { VariableStore } from './variableStore';
import type { DecisionComposition } from './decisionSequence';
import type { DecisionBlockExtras } from './decisionBlocks';
import type { DecisionRoutedContext } from './decisionSceneContext';

/**
 * Everything needed to continue a staged turn that failed partway through, without
 * repeating any stage that already ran — in particular, without paying for another
 * ComfyUI generation or resending a message that already went out. `completedStageIds`/
 * `outputs` come straight from the failed `RunCompiledTurnResult`'s own `stages`/`outputs`
 * (see the `run-failed` branch below), which already accumulate across repeated resumes.
 * `plan`/`store` must be the exact same objects the failed attempt used — a fresh plan
 * would defeat the point (new instances, new creative content, maybe even a new image).
 */
export type StagedRetryState = {
  plan: CompiledTurnPlan;
  store: VariableStore;
  completedStageIds: string[];
  outputs: Record<string, VariableRef>;
  /** Composed items already realized in earlier continuation rounds this turn (see the round
   * loop below), carried through a resume so a retried later round's result still includes
   * what earlier rounds already delivered for real. Empty for a plain (non-continuation) retry. */
  priorItems: ComposedItem[];
};

export type StagedTurnOptions = {
  nodes: WorkflowNode[];
  messages: MessageRecord[];
  currentInputText: string;
  /**
   * The character whose own context view is exposed to the planner as `context`.
   * Character-scoped stage inputs can only disclose facts visible to that same
   * character (VariableStore enforces this), so instances acted by a different
   * character cannot yet consume this context. Composing a per-actor context set
   * for genuinely multi-actor scenes is deferred to the S9/family-rollout work;
   * omit this for narrator-only turns, where only system/shared content compiles.
   */
  primaryCharacterId?: string;
  scope: { saveId: string; branchId: string; turnId: string };
  llm: Pick<NodeLlmApi, 'complete'>;
  /**
   * The live action bridge to execute effectful stages through (the same instance the
   * `actions-v1` path already builds via `createLiveActionBridge`, which structurally
   * satisfies this interface). Omit to run a side-effect-free diagnostic pass instead:
   * any effectful stage fails with a clear "not enabled" error, no real send/generation
   * happens, and the caller must not treat the result as ready to compose/commit.
   */
  actionBridge?: StagedActionBridge;
  signal?: AbortSignal;
  /**
   * Resume a previously failed attempt of this exact turn (S8, first slice: retry without
   * regenerating). When set, planning/compiling is skipped entirely — `nodes`/`messages`/
   * `currentInputText`/`primaryCharacterId`/`scope` above are ignored — and the run
   * continues from `resume.plan`/`resume.store`, treating `resume.completedStageIds` as
   * already done.
   */
  resume?: StagedRetryState;
  /**
   * Route-authored staged instructions text (S9, first slice). Defaults to
   * `defaultStagedInstructionsText` when omitted, so existing callers/tests that don't pass
   * it keep the prior fixed behavior unchanged.
   */
  instructionsText?: string;
  /** Route-authored per-turn budget (S9). Defaults to `resolveStagedLimits({})`'s defaults when omitted. */
  limits?: { beats: number; calls: number; generations: number; continuations: number };
  /** Route-authored recipe allow-list (S9). Omit/empty means every advertised recipe stays
   * available, matching prior behavior. */
  allowedRecipeIds?: string[];
  /** Decision-v1-only presentation controls (structural-variety punch-list item). Ignored by
   * staged-v1 (this file's own runLiveStagedTurn). */
  decisionComposition?: DecisionComposition;
  /** Text resolved from a Decision Router node's input ports (see decisionSceneContext.ts's
   * `DecisionRoutedContext` doc comment). Ignored by staged-v1; undefined when no Decision
   * Router node is in the graph, which keeps decision-v1's prior current-input-only behavior. */
  decisionRoutedContext?: DecisionRoutedContext;
  /** Decision Router node's Style/Tone text and per-block-type prompt wrapping. Ignored by
   * staged-v1. */
  decisionExtras?: DecisionBlockExtras;
  /** Decision Router node's optional free text appended to the sequence-selection prompt.
   * Ignored by staged-v1. */
  decisionSequenceGuidance?: string;
};

/** Total plan requests attempted before giving up on a compile-failed plan (the first
 * request plus this many corrective retries). Mirrors the existing run-failed retry
 * pattern, but for compile failures, which previously aborted the turn outright on the
 * very first rejected plan with no chance for the model to see and fix its own mistake. */
export const maxCompileAttempts = 3;

/** Every real LLM call decision-v1 made this turn (sequence + per-block content/gate calls),
 * plus any block dropped along the way (unresolvable target, failed generation, over the
 * activeness cap, ...) — previously only reached `console.warn`, invisible in the running app.
 * Feeds the existing "Staged Plan Debug" viewer (S9) so a user can copy what actually happened
 * and show it, instead of a silently-vanished block with zero trace. staged-v1 (this file's own
 * `runLiveStagedTurn`) doesn't populate this — its own plan/prompt debug already lives on the
 * graph's `llm-prompt-switch`/`llm-prompt` nodes, which decision-v1 has no equivalent of. */
export type StagedTurnDebugInfo = {
  calls: Array<{ label: string; prompt: string; response: string }>;
  warnings: string[];
};

export type StagedTurnResult =
  | { status: 'compile-failed'; issues: Array<{ path: string; message: string }>; attempts: number }
  /** Retryable: `retry` carries everything `resume` above needs to continue without
   * repeating whatever already succeeded (see `StagedRetryState`). `runStages` is the
   * per-stage status this attempt actually reached (S9: powers the read-only plan viewer). */
  | { status: 'run-failed'; error: string; stages: number; plan: CompiledTurnPlan; runStages: StageRunState[]; retry: StagedRetryState; debug?: StagedTurnDebugInfo }
  /** Every declared beat composed; safe to commit. `items` accumulates every continuation
   * round's beats, not just the last (see the round loop below) — `plan`/`runStages`/`stages`
   * reflect only the last round that actually ran, for debugging (S9's plan viewer).
   * `continuationWarning`, when set, means a later round couldn't be planned/compiled and the
   * scene stopped early — everything already realized is still included in `items`, nothing
   * is rolled back, matching decision-v1's per-block graceful-degradation precedent. */
  | { status: 'ok'; stages: number; plan: CompiledTurnPlan; runStages: StageRunState[]; items: ComposedItem[]; continuationWarning?: string; debug?: StagedTurnDebugInfo }
  /** The run reported success but left beats without realized content — a compiler/
   * scheduler contract mismatch, not a normal failure. Never partially commit this. */
  | { status: 'incomplete'; stages: number; plan: CompiledTurnPlan; runStages: StageRunState[]; incompleteBeatIds: string[]; debug?: StagedTurnDebugInfo };

const stubExecuteAction: StagedSchedulerAdapters['executeAction'] = async ({ stage }: StageExecutionInput) => {
  throw new Error(`Staged action execution is not enabled for this run (recipe ${stage.recipeId}/${stage.key}). `
    + 'This is a diagnostic pass: it compiles the plan and drafts content only; no phone message, image or receipt is produced.');
};

/**
 * Compiles a real staged plan against live app context, requests a real plan from the
 * live LLM, and runs it through the real scheduler/content adapter. With `actionBridge`
 * supplied, effectful stages run for real through the existing shared action executor and
 * a composed, ready-to-commit reply is returned. Without it, action execution is stubbed
 * to a clear error and the result must not be committed — see `StagedTurnOptions.actionBridge`.
 * No final giant assembly LLM call: the returned `items` are deterministically composed by
 * `composeReply` from actual realized drafts/receipts. See
 * docs/superpowers/plans/2026-09-09-staged-workflow.md for the surrounding roadmap.
 */
function summarizeForContinuation(items: ComposedItem[]): string {
  return items.map((item) => item.kind === 'text' ? item.text : `(an action was completed: ${item.receiptId})`).join(' ');
}

export async function runLiveStagedTurn(options: StagedTurnOptions): Promise<StagedTurnResult> {
  if (options.resume) {
    // A resumed attempt continues exactly the one round that failed — the round loop below
    // only ever applies to a fresh (non-resume) call. `priorItems` carries whatever earlier
    // continuation rounds already realized for real, so a successful resume still reports them.
    const run = await runStagedTurn({
      plan: options.resume.plan,
      store: options.resume.store,
      llm: options.llm,
      signal: options.signal,
      resume: { completedStageIds: options.resume.completedStageIds, outputs: options.resume.outputs },
      ...(options.actionBridge ? { actionBridge: options.actionBridge } : { executeAction: stubExecuteAction }),
    });
    return finishRound(options.resume.plan, options.resume.store, run, options.resume.priorItems);
  }

  const catalogRevision = `${options.scope.turnId}:catalog`;
  const characterIds = storyCharactersFromNodes(options.nodes).map((character) => character.id);
  const captured = captureTurnContext({
    scope: options.scope,
    catalogRevision,
    read: () => buildLiveContextSource({
      nodes: options.nodes,
      messages: options.messages,
      currentInputText: options.currentInputText,
      instructions: { general: options.instructionsText ?? defaultStagedInstructionsText },
    }),
  });
  const { context } = captured.view(options.primaryCharacterId);
  const store = captured.store;
  let allocations = 0;
  const limits = options.limits ?? resolveStagedLimits({});
  const compileOptions = {
    context,
    store,
    catalog: { scope: options.scope, revision: catalogRevision, characterIds },
    recipes: stagedRecipeDefinitions(options.allowedRecipeIds),
    initiator: 'model' as const,
    limits,
    allocateId: () => `staged-${options.scope.turnId}-${++allocations}`,
  };

  // A "round" is one compile+run cycle. Round 1 always runs; a model that declares
  // `continuations > 0` in its compiled plan gets up to `limits.continuations` more rounds
  // within this same call, each seeded with a summary of what already happened so it doesn't
  // repeat or contradict earlier rounds (see planPrompt.ts's `continuation` section). This is
  // invisible to the caller: every round's items accumulate into one final `StagedTurnResult`.
  const accumulatedItems: ComposedItem[] = [];
  const summaryParts: string[] = [];
  let continuationsUsed = 0;
  let lastPlan: CompiledTurnPlan | undefined;
  let lastRunStages: StageRunState[] = [];

  for (;;) {
    const continuation = continuationsUsed > 0
      ? { summary: summaryParts.join(' '), roundsRemaining: limits.continuations - continuationsUsed }
      : undefined;
    let issues: Array<{ path: string; message: string }> = [];
    let compiledPlan: CompiledTurnPlan | undefined;
    let attempts = 0;
    while (attempts < maxCompileAttempts) {
      attempts++;
      const planInput = await requestStagedPlan(options.llm, compileOptions,
        { signal: options.signal, ...(issues.length ? { feedback: issues } : {}), ...(continuation ? { continuation } : {}) });
      const compiled = compileTurnPlan(planInput, compileOptions);
      if (compiled.ok) { compiledPlan = compiled.plan; break; }
      issues = compiled.issues;
    }
    if (!compiledPlan) {
      if (accumulatedItems.length > 0 && lastPlan) {
        // Round 1+ already delivered real content; a continuation round that can't be planned
        // is not grounds to discard that — stop here and keep it, same philosophy as
        // decision-v1's per-block skip-with-warning rather than voiding a whole turn.
        const warning = `Continuation round ${continuationsUsed + 1} did not compile after ${attempts} attempt(s); stopping with what already ran.`;
        console.warn(`[staged-v1] ${warning}`);
        return { status: 'ok', stages: lastRunStages.length, plan: lastPlan, runStages: lastRunStages, items: accumulatedItems, continuationWarning: warning };
      }
      return { status: 'compile-failed', issues, attempts };
    }

    const run = await runStagedTurn({
      plan: compiledPlan,
      store,
      llm: options.llm,
      signal: options.signal,
      ...(options.actionBridge ? { actionBridge: options.actionBridge } : { executeAction: stubExecuteAction }),
    });
    if (!run.ok) {
      return {
        status: 'run-failed',
        error: run.error,
        stages: run.stages.length,
        plan: compiledPlan,
        runStages: run.stages,
        retry: {
          plan: compiledPlan,
          store,
          completedStageIds: run.stages.filter((stage) => stage.status === 'succeeded').map((stage) => stage.stageId),
          outputs: run.outputs,
          priorItems: accumulatedItems,
        },
      };
    }

    const composed = composeReply(compiledPlan, run, store);
    if (composed.incompleteBeatIds.length > 0) {
      return { status: 'incomplete', stages: run.stages.length, plan: compiledPlan, runStages: run.stages, incompleteBeatIds: composed.incompleteBeatIds };
    }

    accumulatedItems.push(...composed.items);
    summaryParts.push(summarizeForContinuation(composed.items));
    lastPlan = compiledPlan;
    lastRunStages = run.stages;

    if (compiledPlan.cost.continuations <= 0 || continuationsUsed >= limits.continuations) {
      return { status: 'ok', stages: run.stages.length, plan: compiledPlan, runStages: run.stages, items: accumulatedItems };
    }
    continuationsUsed++;
  }
}

function finishRound(plan: CompiledTurnPlan, store: VariableStore, run: Awaited<ReturnType<typeof runStagedTurn>>, priorItems: ComposedItem[]): StagedTurnResult {
  if (!run.ok) {
    return {
      status: 'run-failed',
      error: run.error,
      stages: run.stages.length,
      plan,
      runStages: run.stages,
      // `run.stages`/`run.outputs` already include every stage resumed from a prior
      // attempt (the scheduler seeds them as 'succeeded' up front), so this accumulates
      // correctly across any number of retries without re-deriving anything from `options.resume`.
      retry: {
        plan,
        store,
        completedStageIds: run.stages.filter((stage) => stage.status === 'succeeded').map((stage) => stage.stageId),
        outputs: run.outputs,
        priorItems,
      },
    };
  }
  const composed = composeReply(plan, run, store);
  if (composed.incompleteBeatIds.length > 0) {
    return { status: 'incomplete', stages: run.stages.length, plan, runStages: run.stages, incompleteBeatIds: composed.incompleteBeatIds };
  }
  return { status: 'ok', stages: run.stages.length, plan, runStages: run.stages, items: [...priorItems, ...composed.items] };
}
