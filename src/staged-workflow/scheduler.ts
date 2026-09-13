import type { CompiledBinding, CompiledStage, CompiledTurnPlan } from './compileTurnPlan';
import type { VariableRecord, VariableRef, VariableValue } from './contracts';
import type { VariableStore } from './variableStore';
import { parseJsonReply } from '../llm/extractJsonReply';
import { validateAssistantChatMessages } from '../actions/assistantChatMessages';
import { actionLimits } from '../actions/schema';

export type StageRunStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked';

export type StageRunState = {
  stageId: string;
  status: StageRunStatus;
  attempts: number;
  startedAtMs?: number;
  endedAtMs?: number;
  output?: VariableRef;
  error?: string;
};

export type StagedRunDiagnostics = {
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  contentCalls: number;
  actionCalls: number;
  variableWrites: number;
};

export type StageRunSnapshot = {
  stages: StageRunState[];
  outputs: Record<string, VariableRef>;
  diagnostics: Omit<StagedRunDiagnostics, 'endedAtMs' | 'durationMs'>;
};

export type StageExecutionInput = {
  stage: CompiledStage;
  inputs: VariableRecord[];
  instruction?: VariableRecord;
  signal?: AbortSignal;
};

export type StagedSchedulerAdapters = {
  generateContent: (input: StageExecutionInput) => Promise<string>;
  executeAction: (input: StageExecutionInput) => Promise<VariableValue>;
};

export type RunCompiledTurnOptions = {
  plan: CompiledTurnPlan;
  store: VariableStore;
  adapters: StagedSchedulerAdapters;
  signal?: AbortSignal;
  retry?: {
    contentAttempts?: number;
  };
  /**
   * Continues a previous, failed run of the exact same compiled plan/store instead of
   * starting over: stages named here are treated as already succeeded, using the
   * already-realized output each one wrote last time, so a stage with a real effect
   * (an image already generated, a message already sent) is never repeated. Build this
   * from a prior `RunCompiledTurnResult`'s own `stages`/`outputs` — see
   * `createResumeState` in `runLiveStagedTurn.ts`.
   */
  resume?: {
    completedStageIds: string[];
    outputs: Record<string, VariableRef>;
  };
  onUpdate?: (snapshot: StageRunSnapshot) => void;
};

export type RunCompiledTurnResult =
  | { ok: true; stages: StageRunState[]; outputs: Record<string, VariableRef>; diagnostics: StagedRunDiagnostics }
  | { ok: false; stages: StageRunState[]; outputs: Record<string, VariableRef>; diagnostics: StagedRunDiagnostics; error: string; failedStageId?: string };

export type ContinuationCheckpoint = {
  realizedOutputs: Record<string, VariableRef>;
  completedBeatIds: string[];
  revisableBeatIds: string[];
  remainingStageIds: string[];
  continuationsUsed: number;
  continuationsRemaining: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Stage failed.';
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The staged run was cancelled.', 'AbortError');
  }
}

function outputValueForStage(stage: CompiledStage, result: string | VariableValue): VariableValue {
  if (stage.output.kind === 'text') {
    if (typeof result !== 'string') throw new Error('Content stage returned a non-text value.');
    return { kind: 'text', text: result };
  }
  if (stage.output.kind === 'messages') {
    // Content stages always return raw text (see contentRunner.ts's stagedContentPrompt,
    // which asks the model for a JSON array in this case, the same "one text completion,
    // parsed as structured JSON" pattern planCall.ts already uses for the plan itself).
    if (typeof result !== 'string') throw new Error('Content stage returned a non-text value.');
    const parsed = parseJsonReply(result, 'Assistant chat content reply is not valid JSON. Expected a JSON array of message objects.');
    const messages = validateAssistantChatMessages(parsed, {
      maxTextLength: actionLimits.text,
      fail: (path, message): never => { throw new Error(`${path}: ${message}`); },
    });
    return { kind: 'messages', messages };
  }
  if (typeof result === 'string') throw new Error('Action stage returned text for a structured output.');
  if (result.kind !== stage.output.kind) throw new Error(`Stage returned ${result.kind}, expected ${stage.output.kind}.`);
  return result;
}

export async function runCompiledTurn({
  plan,
  store,
  adapters,
  signal,
  retry,
  resume,
  onUpdate,
}: RunCompiledTurnOptions): Promise<RunCompiledTurnResult> {
  const runStartedAtMs = performance.now();
  const diagnostics = {
    startedAtMs: runStartedAtMs,
    contentCalls: 0,
    actionCalls: 0,
    variableWrites: 0,
  };
  const stages = plan.stages.map((stage): StageRunState => ({ stageId: stage.id, status: 'pending', attempts: 0 }));
  const stateById = new Map(stages.map((state) => [state.stageId, state]));
  const stageById = new Map(plan.stages.map((stage) => [stage.id, stage]));
  const outputs = new Map<string, VariableRef>();

  // Seed already-succeeded stages from a prior attempt before anything else runs, so
  // dependency checks and materialized-output lookups below see them as already done.
  for (const stageId of resume?.completedStageIds ?? []) {
    const state = stateById.get(stageId);
    const stage = stageById.get(stageId);
    if (!state || !stage) continue;
    const output = resume?.outputs[stage.output.id];
    if (!output) continue;
    state.status = 'succeeded';
    state.output = output;
    outputs.set(stage.output.id, output);
  }

  const snapshot = (): StageRunSnapshot => structuredClone({
    stages,
    outputs: Object.fromEntries(outputs),
    diagnostics,
  });
  const update = () => onUpdate?.(snapshot());
  const finishDiagnostics = (): StagedRunDiagnostics => {
    const endedAtMs = performance.now();
    return {
      ...diagnostics,
      endedAtMs,
      durationMs: Math.max(0, endedAtMs - diagnostics.startedAtMs),
    };
  };
  const contentAttempts = Math.max(1, Math.min(4, retry?.contentAttempts ?? 1));
  const attemptsFor = (stage: CompiledStage) =>
    stage.retryPolicy === 'regenerate-draft-only' && stage.kind === 'generate-content' ? contentAttempts : 1;

  function materialized(ref: CompiledBinding): VariableRef {
    if (ref.source === 'variable') return ref.ref;
    const output = outputs.get(ref.outputId);
    if (!output) throw new Error('Stage input is not ready.');
    if (output.kind !== ref.kind) throw new Error('Materialized output type mismatch.');
    return output;
  }

  function recordsFor(stage: CompiledStage) {
    const inputRefs = stage.inputs.map(materialized);
    const instructionRef = stage.instruction ? materialized(stage.instruction) : undefined;
    const inputs = inputRefs.map((ref) => {
      const record = store.read(ref, plan.context.scope, { characterId: stage.actorId });
      if (store.isInvalidated(ref) || !store.isLatest(ref)) throw new Error('Stage input was superseded or invalidated before execution.');
      return record;
    });
    const instruction = instructionRef
      ? store.read(instructionRef, plan.context.scope, { characterId: stage.actorId })
      : undefined;
    if (instructionRef && (store.isInvalidated(instructionRef) || !store.isLatest(instructionRef))) {
      throw new Error('Stage instruction was superseded or invalidated before execution.');
    }
    return { inputs, instruction };
  }

  try {
    update();
    for (const stageId of plan.executionOrder) {
      assertNotCancelled(signal);
      const stage = stageById.get(stageId);
      const state = stateById.get(stageId);
      if (!stage || !state) throw new Error('Execution order references an unknown stage.');
      if (state.status === 'succeeded') continue;

      const unmet = stage.dependencies.find((dependency) => stateById.get(dependency.stageId)?.status !== 'succeeded');
      if (unmet) {
        state.status = 'blocked';
        state.error = 'Dependency did not complete.';
        update();
        return {
          ok: false,
          stages: structuredClone(stages),
          outputs: Object.fromEntries(outputs),
          diagnostics: finishDiagnostics(),
          error: state.error,
          failedStageId: stage.id,
        };
      }

      state.status = 'ready';
      update();
      const { inputs, instruction } = recordsFor(stage);
      assertNotCancelled(signal);
      state.status = 'running';
      state.attempts += 1;
      state.startedAtMs = performance.now();
      state.endedAtMs = undefined;
      update();

      let rawOutput: string | VariableValue | undefined;
      if (stage.kind === 'generate-content' || stage.kind === 'plan') {
        let lastError: unknown;
        const stageAttempts = attemptsFor(stage);
        for (let attempt = 1; attempt <= stageAttempts; attempt += 1) {
          assertNotCancelled(signal);
          if (attempt > 1) {
            state.attempts += 1;
            update();
          }
          diagnostics.contentCalls += 1;
          try {
            rawOutput = await adapters.generateContent({ stage, inputs, instruction, signal });
            lastError = undefined;
            break;
          } catch (error) {
            lastError = error;
            if (attempt >= stageAttempts) break;
          }
        }
        if (lastError) throw lastError;
      } else if (stage.kind === 'execute-action') {
        diagnostics.actionCalls += 1;
        rawOutput = await adapters.executeAction({ stage, inputs, instruction, signal });
      }
      if (rawOutput === undefined) throw new Error(`No runner is registered for ${stage.kind}.`);
      assertNotCancelled(signal);

      const value = outputValueForStage(stage, rawOutput);
      const inputRefs = [
        ...stage.inputs.map(materialized),
        ...(stage.instruction ? [materialized(stage.instruction)] : []),
      ];
      const output = store.write({
        id: stage.output.id,
        value,
        inputs: inputRefs,
        producer: { kind: 'stage', stageId: stage.id },
        provenance: stage.output.kind === 'receipt' ? 'observed' : 'generated',
        visibility: stage.visibility,
        retention: stage.output.kind === 'receipt' ? 'turn' : 'draft',
      });
      if (stage.output.kind === 'receipt') {
        store.markCommitted(output);
      }
      diagnostics.variableWrites += 1;
      outputs.set(stage.output.id, output);
      state.status = 'succeeded';
      state.output = output;
      state.endedAtMs = performance.now();
      update();
    }
    return { ok: true, stages: structuredClone(stages), outputs: Object.fromEntries(outputs), diagnostics: finishDiagnostics() };
  } catch (error) {
    const message = errorMessage(error);
    const running = stages.find((state) => state.status === 'running' || state.status === 'ready');
    if (running) {
      running.status = error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
      running.error = message;
      running.endedAtMs = performance.now();
    }
    for (const state of stages) {
      if (state.status === 'pending') {
        state.status = 'blocked';
        state.error = 'Earlier stage did not complete.';
      }
    }
    update();
    return {
      ok: false,
      stages: structuredClone(stages),
      outputs: Object.fromEntries(outputs),
      diagnostics: finishDiagnostics(),
      error: message,
      ...(running ? { failedStageId: running.stageId } : {}),
    };
  }
}

export function createContinuationCheckpoint(
  plan: CompiledTurnPlan,
  result: RunCompiledTurnResult,
  store: VariableStore,
): ContinuationCheckpoint {
  const realizedOutputs = structuredClone(result.outputs);
  const stageById = new Map(result.stages.map((stage) => [stage.stageId, stage]));
  const materialized = (binding: CompiledBinding) => binding.source === 'variable' ? binding.ref : realizedOutputs[binding.outputId];
  const bindingReady = (binding: CompiledBinding) => {
    const ref = materialized(binding);
    return !!ref && !store.isInvalidated(ref);
  };
  const receiptCommitted = (binding: CompiledBinding) => {
    const ref = materialized(binding);
    return !!ref && ref.kind === 'receipt' && store.isCommitted(ref);
  };
  const completedBeatIds: string[] = [];
  const revisableBeatIds: string[] = [];
  for (const beat of plan.beats) {
    const complete = beat.content.every(bindingReady) && beat.requiresReceipts.every(receiptCommitted);
    if (complete) completedBeatIds.push(beat.id);
    else revisableBeatIds.push(beat.id);
  }
  const continuationsUsed = plan.cost.continuations;
  return {
    realizedOutputs,
    completedBeatIds,
    revisableBeatIds,
    remainingStageIds: plan.executionOrder.filter((stageId) => stageById.get(stageId)?.status !== 'succeeded'),
    continuationsUsed,
    continuationsRemaining: Math.max(0, plan.limits.continuations - continuationsUsed),
  };
}
