import type { MessageRecord, WorkflowNode } from '../types';
import type { Visibility } from './contracts';

type ContextFact = { sourceId: string; text: string; visibility: Visibility };

export type LiveContextSourceInput = {
  nodes: WorkflowNode[];
  messages: MessageRecord[];
  /** Already-committed history. The current turn's not-yet-committed input text is
   * exposed separately below rather than fabricated as a fake MessageRecord id. */
  latestMessageIds?: number[];
  currentInputText?: string;
  instructions: Record<string, string>;
};

/**
 * Pure mapping from live `useGraphRun` state into the shape `captureTurnContext`'s
 * `read()` callback needs. Reuses the caller's own nodes/messages without cloning
 * (contextBuilder.ts already deep-clones on capture). Live facts/summaries beyond
 * the current-input note are not sourced yet; captureTurnContext already derives
 * authoritative storybook/banking facts internally from `nodes`/`messages`.
 */
export function buildLiveContextSource(input: LiveContextSourceInput) {
  const currentInput = input.currentInputText?.trim();
  return {
    nodes: input.nodes,
    messages: input.messages,
    latestMessageIds: input.latestMessageIds ?? [],
    instructions: input.instructions,
    ...(currentInput
      ? { facts: [{ sourceId: 'current-input', text: currentInput, visibility: { kind: 'shared' } as Visibility } satisfies ContextFact] }
      : {}),
  };
}
