import { useMemo } from 'react';
import { NodeLlmApi } from '../llm/NodeLlmApi';
import type { ConnectionPreset, LlmCallStage, LlmCallStats } from '../types';

type RecordNodeLlmCall = (
  nodeId: string,
  label: string,
  stats: LlmCallStats,
  metadata?: { startedAtMs: number; stage?: LlmCallStage },
) => void;

type UseNodeLlmApiOptions = {
  resolveConnection: (
    connectionId?: string,
    purpose?: string,
    signal?: AbortSignal,
  ) => Promise<ConnectionPreset>;
  recordCall: RecordNodeLlmCall;
  onReasoningTokens: (nodeId: string, tokenCount: number) => void;
  onReasoningActivity: (nodeId: string, active: boolean) => void;
};

export function useNodeLlmApi({
  resolveConnection,
  recordCall,
  onReasoningTokens,
  onReasoningActivity,
}: UseNodeLlmApiOptions) {
  return useMemo(
    () => new NodeLlmApi({
      resolveConnection,
      recordCall,
      onReasoningTokens,
      onReasoningActivity,
    }),
    [onReasoningActivity, onReasoningTokens, recordCall, resolveConnection],
  );
}
