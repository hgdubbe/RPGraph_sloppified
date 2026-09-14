import { validateAssistantChatMessages } from '../actions/assistantChatMessages';
import { actionLimits } from '../actions/schema';
import { parseJsonReply } from '../llm/extractJsonReply';
import type { CompiledBinding, CompiledStage, CompiledTurnPlan } from './compileTurnPlan';
import type { DependencyKind, TurnContext, VariableRef, VariableValue, Visibility } from './contracts';
import type { VariableStore } from './variableStore';
import type { DecisionOutcome } from './decisionNodes';
import { stagedRecipeById, stagedRecipeDefinitions } from './recipeInventory';
import { latestPostByAuthor, type DecisionSceneContext } from './decisionSceneContext';
import { decisionBlockRecipeIds, targetsCharacter, type DecisionBlockRequest } from './decisionSequence';

type LockedArgumentsResult = { ok: true; args: Record<string, string | number | boolean> } | { ok: false; reason: string };

/** Per-family locked-argument shape, matching each recipe's `validate()` in recipeInventory.ts. */
function resolveLockedArguments(
  request: DecisionBlockRequest, actorId: string, target: { id: string } | undefined, scene: DecisionSceneContext,
): LockedArgumentsResult {
  switch (request.type) {
    case 'narration':
      return { ok: true, args: {} };
    case 'image': case 'note': case 'assistant-chat':
      return { ok: true, args: { ownerId: actorId } };
    case 'whatsup-message': case 'voice-message':
      if (!target) return { ok: false, reason: `unknown recipient "${request.target ?? ''}"` };
      return { ok: true, args: { recipientId: target.id } };
    case 'picture-message':
      if (!target) return { ok: false, reason: `unknown recipient "${request.target ?? ''}"` };
      return { ok: true, args: { ownerId: actorId, recipientId: target.id } };
    case 'bank-transfer': {
      if (!target) return { ok: false, reason: `unknown recipient "${request.target ?? ''}"` };
      const amount = Number(request.detail);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: `invalid transfer amount "${request.detail ?? ''}"` };
      return { ok: true, args: { fromId: actorId, toId: target.id, amount } };
    }
    case 'social-post': {
      const app = (request.target ?? 'fotogram').toLowerCase();
      if (app !== 'fotogram' && app !== 'onlyfriends') return { ok: false, reason: `unknown social app "${request.target ?? ''}"` };
      return { ok: true, args: { app } };
    }
    case 'social-comment': {
      if (!target) return { ok: false, reason: `unknown author "${request.target ?? ''}"` };
      const post = latestPostByAuthor(scene, request.target);
      if (!post) return { ok: false, reason: `no existing post found by "${request.target ?? ''}"` };
      return { ok: true, args: { app: post.app, postId: post.postId } };
    }
  }
}

/**
 * Builds a real `CompiledTurnPlan` directly in code from dispatched blocks' already-drafted
 * content — never from parsed model JSON, so there is no compiler/validator step here (there is
 * nothing untrusted to validate: every id, ref and dependency is backend-constructed against
 * `stagedRecipeDefinitions()`'s known step shapes, the same ones the old compiler targets).
 *
 * Each `generate-content`/`plan` step's realized text is written into the `VariableStore`
 * ourselves and its stage id collected into `completedStageIds` — `runDecisionStagedTurn.ts`
 * hands this to the *unmodified* `runStagedTurn`/`runCompiledTurn` via `resume`, so the real
 * scheduler only ever executes the real `execute-action` steps (real sends/generations,
 * receipts, effect-journal durability, S8 retry — all untouched, all reused).
 */

export type DecisionAssembly = {
  stages: CompiledStage[];
  beats: CompiledTurnPlan['beats'];
  scene: CompiledTurnPlan['scene'];
  completedStageIds: string[];
  resumeOutputs: Record<string, VariableRef>;
  warnings: string[];
};

export function createDecisionAssembly(): DecisionAssembly {
  return { stages: [], beats: [], scene: [], completedStageIds: [], resumeOutputs: {}, warnings: [] };
}

function dependencyKindFor(outputKind: CompiledStage['output']['kind']): DependencyKind {
  return outputKind === 'receipt' ? 'observation' : outputKind === 'artifact' ? 'artifact' : 'content';
}

function resolveStepInput(name: string, stagesByKey: Map<string, CompiledStage>, context: TurnContext): CompiledBinding {
  if (name === 'context') return { source: 'variable', ref: context.OC };
  if (name === 'instructions') return { source: 'variable', ref: context.instructions.general };
  const source = stagesByKey.get(name);
  if (!source) throw new Error(`Unknown recipe step input reference: ${name}`);
  return { source: 'output', stageId: source.id, outputId: source.output.id, kind: source.output.kind };
}

/** Adds one dispatched block's already-run decision outcomes to the assembly. A block whose
 * target character can't be resolved, or whose recipe expects a drafted step that never got
 * (or got skipped) content, is dropped with a note in `warnings` rather than failing the turn. */
export function addDecisionBlock(
  assembly: DecisionAssembly,
  request: DecisionBlockRequest,
  outcomes: DecisionOutcome[],
  scene: DecisionSceneContext,
  context: TurnContext,
  store: VariableStore,
  allocateId: () => string,
  allowedRecipeIds?: readonly string[],
): void {
  const recipeId = decisionBlockRecipeIds[request.type];
  const recipe = stagedRecipeDefinitions(allowedRecipeIds).find((candidate) => candidate.id === recipeId);
  if (!recipe) {
    assembly.warnings.push(`Skipped ${request.type}: recipe "${recipeId}" is not available on this route.`);
    return;
  }
  const actor = scene.characters[scene.actorName];
  if (!actor) {
    assembly.warnings.push(`Skipped ${request.type}: unknown acting character "${scene.actorName}".`);
    return;
  }
  const target = request.target && targetsCharacter[request.type] ? scene.characters[request.target] : undefined;
  if (request.target && targetsCharacter[request.type] && !target) {
    assembly.warnings.push(`Skipped ${request.type}: unknown recipient "${request.target}".`);
    return;
  }
  const lockedArgumentsResult = resolveLockedArguments(request, actor.id, target, scene);
  if (!lockedArgumentsResult.ok) {
    assembly.warnings.push(`Skipped ${request.type}: ${lockedArgumentsResult.reason}.`);
    return;
  }

  const instanceId = allocateId();
  const stageKey = (key: string) => `stage/${instanceId}/${key}`;
  // Matches the visibility scope `context.OC` was itself captured at (the acting character
  // only) — broadening to include the recipient here would mean "discloses a private input"
  // to the store, since OC's own visibility doesn't extend to them. The real recipient is
  // enforced separately via `lockedArguments.recipientId` and the real action dispatch; this
  // field is about narrative-knowledge audience, not who the effect is actually sent to.
  const visibility: Visibility = { kind: 'characters', characterIds: [actor.id] };
  const lockedArguments = lockedArgumentsResult.args;
  const contentOutcomeById = new Map(
    outcomes.filter((outcome): outcome is Extract<DecisionOutcome, { kind: 'content' }> => outcome.kind === 'content')
      .map((outcome) => [outcome.id, outcome]),
  );
  const stagesByKey = new Map<string, CompiledStage>();

  for (const step of recipe.steps) {
    const id = stageKey(step.key);
    const inputBindings = step.inputs.map((name) => resolveStepInput(name, stagesByKey, context));
    const instructionBinding = step.instruction ? resolveStepInput(step.instruction, stagesByKey, context) : undefined;

    if (step.kind === 'execute-action') {
      const stage: CompiledStage = {
        id, instanceId, recipeId: recipe.id, key: step.key, kind: step.kind, actorId: actor.id, visibility,
        lockedArguments, retryPolicy: recipe.retryPolicy, inputs: inputBindings,
        ...(instructionBinding ? { instruction: instructionBinding } : {}),
        output: { id: `${id}/output`, kind: step.output },
        dependencies: step.inputs.flatMap((name) => {
          const source = stagesByKey.get(name);
          return source ? [{ stageId: source.id, kind: dependencyKindFor(source.output.kind) }] : [];
        }),
      };
      assembly.stages.push(stage);
      stagesByKey.set(step.key, stage);
      continue;
    }

    // generate-content/plan: already drafted by our own small scoped calls (decisionNodes.ts).
    // Write the realized value ourselves and mark the stage pre-completed via `resume` — the
    // scheduler's own generateContent adapter is never invoked for it (see file doc comment).
    const outcome = contentOutcomeById.get(step.key);
    if (!outcome || outcome.skipped) {
      assembly.warnings.push(`Skipped ${request.type}: no drafted content for step "${step.key}".`);
      return;
    }
    const stage: CompiledStage = {
      id, instanceId, recipeId: recipe.id, key: step.key, kind: step.kind, actorId: actor.id, visibility,
      lockedArguments, retryPolicy: recipe.retryPolicy, inputs: inputBindings,
      ...(instructionBinding ? { instruction: instructionBinding } : {}),
      output: { id: `${id}/output`, kind: step.output },
      dependencies: [],
    };
    let value: VariableValue;
    if (step.output === 'text') {
      value = { kind: 'text', text: outcome.text };
    } else if (step.output === 'messages') {
      // assistant.chat is the one family whose step produces structured `messages`, not text —
      // the content node asked for a small JSON array directly (decisionBlocks.ts's
      // `expectsJson`); reuse the exact same shape/alternation validator the real scheduler
      // path uses for JSON-authored plans, so the two can't drift on what counts as valid.
      try {
        const parsed = parseJsonReply(outcome.text, 'Decision workflow assistant-chat reply is not valid JSON.');
        const messages = validateAssistantChatMessages(parsed, {
          maxTextLength: actionLimits.text, fail: (path, message): never => { throw new Error(`${path}: ${message}`); },
        });
        value = { kind: 'messages', messages };
      } catch (error) {
        assembly.warnings.push(`Skipped ${request.type}: ${error instanceof Error ? error.message : 'invalid assistant-chat reply'}.`);
        return;
      }
    } else {
      assembly.warnings.push(`Skipped ${request.type}: unsupported drafted output kind "${step.output}".`);
      return;
    }
    const materializedInputs = [...inputBindings, ...(instructionBinding ? [instructionBinding] : [])]
      .map((binding): VariableRef => binding.source === 'variable' ? binding.ref : assembly.resumeOutputs[binding.outputId]);
    const output = store.write({
      id: stage.output.id, value, inputs: materializedInputs,
      producer: { kind: 'stage', stageId: stage.id }, provenance: 'generated', visibility, retention: 'draft',
    });
    assembly.stages.push(stage);
    stagesByKey.set(step.key, stage);
    assembly.completedStageIds.push(stage.id);
    assembly.resumeOutputs[stage.output.id] = output;
  }

  // composeReply.ts only renders 'text' and 'receipt' beat content — a recipe whose natural
  // presentation is 'attachment' (image.generate) or 'state-only'/'receipt-only' (note.write,
  // assistant.chat, bank.transfer) has nothing sensible to show as its own standalone visible
  // beat (an image.generate beat would try to compose a bare 'artifact' value and throw). The
  // real effect still runs either way; only the presentational beat is conditional.
  const isVisibleBeat = stagedRecipeById(recipeId)?.presentation === 'visible-beat';
  if (isVisibleBeat) {
    const instanceStages = assembly.stages.filter((stage) => stage.instanceId === instanceId);
    const lastStage = instanceStages[instanceStages.length - 1];
    if (lastStage) {
      const binding: CompiledBinding = { source: 'output', stageId: lastStage.id, outputId: lastStage.output.id, kind: lastStage.output.kind };
      assembly.beats.push({
        id: `beat/${instanceId}`, alias: `beat/${instanceId}`, speakerId: actor.id, visibility,
        content: [binding], requiresReceipts: lastStage.output.kind === 'receipt' ? [binding] : [],
      });
    }
  }
  const purpose = `${request.type}${request.target ? ` to ${request.target}` : ''}`;
  assembly.scene.push({ id: instanceId, alias: instanceId, purpose, actorId: actor.id, recipeId: recipe.id, lockedArguments });
}

const decisionLimits = { beats: 128, calls: 128, generations: 16, continuations: 8 };

export function finalizeDecisionPlan(assembly: DecisionAssembly, context: TurnContext) {
  const calls = assembly.stages.filter((stage) => stage.kind === 'generate-content' || stage.kind === 'plan').length;
  const plan: CompiledTurnPlan = {
    version: 'staged-v1', context, stages: assembly.stages, executionOrder: assembly.stages.map((stage) => stage.id),
    scene: assembly.scene, beats: assembly.beats, limits: decisionLimits, cost: { beats: assembly.beats.length, calls, generations: 0, continuations: 0 },
  };
  return { plan, resume: { completedStageIds: assembly.completedStageIds, outputs: assembly.resumeOutputs } };
}
