import {
  llmCallStageLabel,
  nodeFallbackStageLabel,
  promptSwitchRouteLabel,
} from '../llm/callDisplay';
import type { WorkflowNode } from '../types';

function currentRuntimeNode(nodes: WorkflowNode[]) {
  const activeCallNode = nodes
    .filter((node) => !!node.data.llmActiveCallLabel)
    .sort((left, right) =>
      (right.data.llmActiveCallStartedAtMs ?? 0) - (left.data.llmActiveCallStartedAtMs ?? 0)
    )[0];
  if (activeCallNode) {
    return activeCallNode;
  }
  return nodes
    .filter((node) => node.data.runActive)
    .sort((left, right) =>
      (right.data.runActiveStartedAtMs ?? 0) - (left.data.runActiveStartedAtMs ?? 0)
    )[0];
}

export function runProgress(nodes: WorkflowNode[]) {
  const node = currentRuntimeNode(nodes);
  const runtimeData = node && node.data.kind === undefined ? node.data : undefined;
  const route = runtimeData ? promptSwitchRouteLabel(runtimeData) : undefined;
  const stage = runtimeData
    ? runtimeData.llmActiveCallLabel
      ? llmCallStageLabel(runtimeData.llmActiveCallStage, runtimeData.llmActiveCallLabel)
      : nodeFallbackStageLabel(runtimeData)
    : 'Preparing workflow';
  const activity = `${route ?? runtimeData?.label ?? 'RPGraph'}: ${stage}`;

  return { activity, reasoningTokens: runtimeData?.llmActiveReasoningTokens };
}

export type RunProgress = ReturnType<typeof runProgress>;
