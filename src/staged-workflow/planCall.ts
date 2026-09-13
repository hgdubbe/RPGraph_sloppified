import { parseJsonReply } from '../llm/extractJsonReply';
import type { NodeLlmApi } from '../llm/NodeLlmApi';
import type { NodeLlmRequest } from '../llm/types';
import { buildPlanPrompt, type PlanPromptContinuation, type PlanPromptIssue } from './planPrompt';
import type { CompileOptions } from './compileTurnPlan';

type StagedPlanLlm = Pick<NodeLlmApi, 'complete'>;

export type StagedPlanCallOptions = {
  connectionId?: string;
  maxTokens?: number;
  temperature?: number;
  useConnectionSampling?: boolean;
  fastTask?: boolean;
  signal?: AbortSignal;
  /** Compiler issues from a prior rejected attempt this turn, appended to the prompt as
   * corrective feedback (see the compile-failed retry loop in runLiveStagedTurn). */
  feedback?: PlanPromptIssue[];
  /** Set when requesting round 2+ of the same turn (see the continuation round loop in
   * runLiveStagedTurn). */
  continuation?: PlanPromptContinuation;
};

/**
 * Calls the managed staged-plan prompt and returns a parsed compact-plan object
 * ready for `compileTurnPlan`/`compileAndRunStagedTurn`. Never repairs or guesses
 * a malformed plan reply; `compileTurnPlan` remains the only shape/permission gate.
 */
export async function requestStagedPlan(
  llm: StagedPlanLlm,
  compileOptions: CompileOptions,
  options: StagedPlanCallOptions = {},
): Promise<unknown> {
  const prompt = buildPlanPrompt(compileOptions, options.feedback, options.continuation);
  const request: NodeLlmRequest = {
    connectionId: options.connectionId,
    prompt,
    label: 'Staged workflow plan',
    stage: { kind: 'step', name: 'Staged plan' },
    purpose: 'Staged workflow compact plan',
    signal: options.signal,
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.useConnectionSampling !== undefined ? { useConnectionSampling: options.useConnectionSampling } : {}),
    ...(options.fastTask !== undefined ? { fastTask: options.fastTask } : {}),
  };
  const result = await llm.complete(request);
  return parseJsonReply(result.text, 'Staged plan reply is not valid JSON. Expected one complete JSON object, optionally inside a JSON code fence.');
}
