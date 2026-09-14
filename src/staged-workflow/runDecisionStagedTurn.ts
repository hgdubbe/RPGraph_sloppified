import type { CompiledTurnPlan } from './compileTurnPlan';
import { composeReply } from './composeReply';
import { addDecisionBlock, createDecisionAssembly, finalizeDecisionPlan } from './decisionAssembler';
import { buildBlockPlan } from './decisionBlocks';
import { runDecisionNodes } from './decisionNodes';
import { captureDecisionContext } from './decisionSceneContext';
import {
  availableBlockTypes, buildSequencePrompt, parseSequence, targetsCharacter,
  defaultDecisionComposition, type DecisionBlockRequest,
} from './decisionSequence';
import { runStagedTurn } from './orchestrator';
import type { RunCompiledTurnResult } from './scheduler';
import { defaultStagedInstructionsText } from './stagedInstructionsPrompt';
import type { StageExecutionInput, StagedSchedulerAdapters } from './scheduler';
import type { StagedTurnDebugInfo, StagedTurnOptions, StagedTurnResult } from './runLiveStagedTurn';
import type { VariableStore } from './variableStore';

/**
 * decision-v1: the local-model-friendly replacement for the compact-plan JSON planner
 * (compileTurnPlan.ts/planPrompt.ts/planCall.ts, all untouched — this is purely additive).
 *
 * Same signature and result shape as runLiveStagedTurn, so it slots into useGraphRun.ts as a
 * drop-in alternative: `'run-failed'`/`'incomplete'`/`'ok'` are unchanged, so S8's retry loop
 * and S9's plan-debug viewer both keep working with zero changes there.
 *
 * Where the old planner asked the model to emit one large structured plan up front, this asks
 * a tiny freeform call which block types happen this turn and in what order (decisionSequence.ts),
 * then runs each chosen block's own small tree of scoped decide/draft calls (decisionNodes.ts +
 * decisionBlocks.ts), then builds the real CompiledTurnPlan directly in code from the known
 * recipe step shapes (decisionAssembler.ts) — reusing the entire existing execution stack
 * (runStagedTurn/scheduler/stagedActionAdapter/effect journal/composeReply) unchanged.
 */

const stubExecuteAction: StagedSchedulerAdapters['executeAction'] = async ({ stage }: StageExecutionInput) => {
  throw new Error(`Decision workflow action execution is not enabled for this run (recipe ${stage.recipeId}/${stage.key}). `
    + 'This is a diagnostic pass: it drafts content only; no phone message, image or receipt is produced.');
};

function finishRun(plan: CompiledTurnPlan, store: VariableStore, run: RunCompiledTurnResult, debug?: StagedTurnDebugInfo): StagedTurnResult {
  if (!run.ok) {
    return {
      status: 'run-failed', error: run.error, stages: run.stages.length, plan, runStages: run.stages, debug,
      // decision-v1 has no continuation-round concept (see runLiveStagedTurn.ts's round
      // loop) — always empty here, kept only because StagedRetryState is shared.
      retry: {
        plan, store,
        completedStageIds: run.stages.filter((stage) => stage.status === 'succeeded').map((stage) => stage.stageId),
        outputs: run.outputs, priorItems: [],
      },
    };
  }
  const composed = composeReply(plan, run, store);
  if (composed.incompleteBeatIds.length > 0) {
    return { status: 'incomplete', stages: run.stages.length, plan, runStages: run.stages, incompleteBeatIds: composed.incompleteBeatIds, debug };
  }
  return { status: 'ok', stages: run.stages.length, plan, runStages: run.stages, items: composed.items, debug };
}

export async function runDecisionStagedTurn(options: StagedTurnOptions): Promise<StagedTurnResult> {
  if (options.resume) {
    const run = await runStagedTurn({
      plan: options.resume.plan, store: options.resume.store, llm: options.llm, signal: options.signal,
      resume: { completedStageIds: options.resume.completedStageIds, outputs: options.resume.outputs },
      ...(options.actionBridge ? { actionBridge: options.actionBridge } : { executeAction: stubExecuteAction }),
    });
    return finishRun(options.resume.plan, options.resume.store, run);
  }

  const catalogRevision = `${options.scope.turnId}:catalog`;
  const { store, context, scene } = captureDecisionContext({
    nodes: options.nodes, messages: options.messages, currentInputText: options.currentInputText,
    primaryCharacterId: options.primaryCharacterId, scope: options.scope, catalogRevision,
    instructionsText: options.instructionsText ?? defaultStagedInstructionsText,
    routedContext: options.decisionRoutedContext,
  });

  const debugCalls: StagedTurnDebugInfo['calls'] = [];

  const composition = options.decisionComposition ?? defaultDecisionComposition;
  const blockTypes = availableBlockTypes(options.allowedRecipeIds);
  const sequencePrompt = buildSequencePrompt(scene, blockTypes, composition, options.decisionSequenceGuidance);
  const sequenceResult = await options.llm.complete({
    prompt: sequencePrompt, label: 'Decision workflow / sequence',
    purpose: 'Decision workflow sequence', signal: options.signal,
  });
  debugCalls.push({ label: 'Decision workflow / sequence', prompt: sequencePrompt, response: sequenceResult.text });
  const rawSequence = parseSequence(sequenceResult.text, blockTypes, Object.keys(scene.characters));
  // Sanity-check backstop only, never the decision-maker: the model was already told the cap
  // in buildSequencePrompt's guidance and should self-limit; this just guards against it not
  // doing so. Narration doesn't count against the cap — only non-narration ("action") blocks.
  let actionCount = 0;
  const droppedCount = rawSequence.filter((request) => request.type !== 'narration').length - composition.maxActionsPerTurn;
  const sequence: DecisionBlockRequest[] = rawSequence.filter((request) => {
    if (request.type === 'narration') return true;
    if (actionCount >= composition.maxActionsPerTurn) return false;
    actionCount += 1;
    return true;
  });

  let allocations = 0;
  const allocateId = () => `decision-${options.scope.turnId}-${++allocations}`;
  const assembly = createDecisionAssembly();
  if (droppedCount > 0) {
    assembly.warnings.push(`Dropped ${droppedCount} action block(s) beyond the configured max of ${composition.maxActionsPerTurn} per turn.`);
  }
  for (const request of sequence) {
    // Resolve the recipient before spending a draft-content call on it — decisionAssembler.ts
    // checks this again (it's the authority on what actually gets dropped), but catching an
    // unresolvable target here first avoids drafting a message addressed to a name nobody has.
    if (request.target && targetsCharacter[request.type] && !scene.characters[request.target]) {
      assembly.warnings.push(`Skipped ${request.type}: unknown recipient "${request.target}".`);
      continue;
    }
    const { nodes, context: blockContext } = buildBlockPlan(request, scene, composition, options.decisionExtras);
    try {
      const outcomes = await runDecisionNodes(nodes, blockContext, options.llm, {
        labelPrefix: `Decision workflow / ${request.type}`, signal: options.signal,
        onCall: (call) => debugCalls.push(call),
      });
      addDecisionBlock(assembly, request, outcomes, scene, context, store, allocateId, options.allowedRecipeIds);
    } catch (error) {
      // One block's call failing (an empty/malformed reply, a transient provider hiccup) drops
      // only that block — a real strength of small scoped calls over one giant plan call, where
      // a single failure used to void the whole turn. An aborted run (user cancel) still
      // propagates, since that's not a per-block content failure to recover from.
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      assembly.warnings.push(`Skipped ${request.type}: ${error instanceof Error ? error.message : 'decision call failed'}.`);
    }
  }
  // Also surfaced on the typed result now (`debug`, S13) for the "Staged Plan Debug" viewer —
  // console.warn kept too, harmless, still useful when a devtools console is open.
  for (const warning of assembly.warnings) console.warn(`[decision-v1] ${warning}`);

  const { plan, resume } = finalizeDecisionPlan(assembly, context);
  const run = await runStagedTurn({
    plan, store, llm: options.llm, signal: options.signal, resume,
    ...(options.actionBridge ? { actionBridge: options.actionBridge } : { executeAction: stubExecuteAction }),
  });
  return finishRun(plan, store, run, { calls: debugCalls, warnings: assembly.warnings });
}
