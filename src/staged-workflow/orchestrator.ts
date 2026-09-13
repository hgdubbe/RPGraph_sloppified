import type { NodeLlmApi } from '../llm/NodeLlmApi';
import { compileTurnPlan, type CompileOptions, type PlanCompileResult } from './compileTurnPlan';
import { createStagedContentAdapter, type StagedContentRunnerOptions } from './contentRunner';
import { createStagedActionAdapter, type StagedActionBridge } from './stagedActionAdapter';
import {
  createContinuationCheckpoint,
  runCompiledTurn,
  type ContinuationCheckpoint,
  type RunCompiledTurnOptions,
  type RunCompiledTurnResult,
  type StagedSchedulerAdapters,
} from './scheduler';

type StagedContentLlm = Pick<NodeLlmApi, 'complete'>;

type RunStagedTurnBaseOptions = Omit<RunCompiledTurnOptions, 'adapters'> & {
  llm: StagedContentLlm;
  content?: StagedContentRunnerOptions;
};

export type RunStagedTurnOptions = RunStagedTurnBaseOptions & (
  | { executeAction: StagedSchedulerAdapters['executeAction']; actionBridge?: never }
  | { actionBridge: StagedActionBridge; executeAction?: never }
);

export function runStagedTurn(options: RunStagedTurnOptions): Promise<RunCompiledTurnResult> {
  const { llm, content, plan, store, signal, retry, resume, onUpdate } = options;
  const executeAction = 'executeAction' in options && options.executeAction
    ? options.executeAction
    : createStagedActionAdapter(options.actionBridge);
  return runCompiledTurn({
    plan,
    store,
    signal,
    retry,
    resume,
    onUpdate,
    adapters: {
      generateContent: createStagedContentAdapter(llm, content),
      executeAction,
    },
  });
}

export type CompileAndRunStagedTurnOptions = Omit<CompileOptions, 'store'> & Omit<RunStagedTurnOptions, 'plan'> & {
  planInput: unknown;
};

export type CompileAndRunStagedTurnResult =
  | { compiled: false; compile: PlanCompileResult }
  | { compiled: true; run: RunCompiledTurnResult; checkpoint: ContinuationCheckpoint };

export async function compileAndRunStagedTurn(options: CompileAndRunStagedTurnOptions): Promise<CompileAndRunStagedTurnResult> {
  const { planInput, store, context, catalog, recipes, initiator, directActions, limits, allocateId } = options;
  const compile = compileTurnPlan(planInput, {
    context,
    store,
    catalog,
    recipes,
    initiator,
    directActions,
    limits,
    allocateId,
  });
  if (!compile.ok) return { compiled: false, compile };
  const runBase = {
    plan: compile.plan,
    store,
    llm: options.llm,
    content: options.content,
    signal: options.signal,
    retry: options.retry,
    onUpdate: options.onUpdate,
  };
  let run: RunCompiledTurnResult;
  if ('executeAction' in options && options.executeAction) {
    run = await runStagedTurn({ ...runBase, executeAction: options.executeAction });
  } else if ('actionBridge' in options && options.actionBridge) {
    run = await runStagedTurn({ ...runBase, actionBridge: options.actionBridge });
  } else {
    throw new Error('Staged turn execution requires an action adapter or action bridge.');
  }
  return {
    compiled: true,
    run,
    checkpoint: createContinuationCheckpoint(compile.plan, run, store),
  };
}
