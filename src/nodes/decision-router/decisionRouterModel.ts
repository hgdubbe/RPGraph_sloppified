import type { WorkflowNodeData } from '../../types';
import type { DecisionBlockType } from '../../staged-workflow/decisionSequence';
import type { DecisionBlockOverrides, DecisionBlockExtras } from '../../staged-workflow/decisionBlocks';
import { defaultDecisionComposition } from '../../staged-workflow/decisionSequence';

/** Shared 5-tier scale for Narrativeness/Activeness — moved here verbatim from the RP Output
 * node's Card.tsx, which used to own these settings. */
export const decisionTierOptions = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
  { value: 4, label: 'Always' },
];

/** One entry per `DecisionBlockType` (decisionSequence.ts) — the config UI shows one
 * collapsible section per block type, each with a read-only reference to the block's
 * built-in instruction (see decisionBlockReferenceText below) plus before/after overrides. */
export const decisionBlockTypeLabels: Record<DecisionBlockType, string> = {
  narration: 'Narration',
  'whatsup-message': 'WhatsUp text message',
  'voice-message': 'WhatsUp voice message',
  image: 'Image (kept, not sent)',
  'picture-message': 'Picture message (sent)',
  note: 'Phone note',
  'bank-transfer': 'Bank transfer',
  'social-post': 'Social post',
  'social-comment': 'Social comment',
  'assistant-chat': 'Assistant chat',
};

export const decisionBlockTypes = Object.keys(decisionBlockTypeLabels) as DecisionBlockType[];

/** Reads the Decision Router node's own settings off its `WorkflowNodeData`, with the same
 * defaults `defaultDecisionComposition` already documents — moved here from
 * `src/nodes/output/Card.tsx` (previously the RP Output node's own fields). */
export function resolveDecisionRouterSettings(data: WorkflowNodeData) {
  return {
    narrativeness: data.decisionNarrativeness ?? defaultDecisionComposition.narrativeness,
    defaultActiveness: data.decisionDefaultActiveness ?? defaultDecisionComposition.defaultActiveness,
    maxActionsPerTurn: data.decisionMaxActionsPerTurn ?? defaultDecisionComposition.maxActionsPerTurn,
    respectUserAgency: data.decisionRespectUserAgency ?? defaultDecisionComposition.respectUserAgency,
    styleTone: data.decisionStyleTone ?? '',
    sequenceGuidance: data.decisionSequenceGuidance ?? '',
  };
}

/** Narrows the node data's loosely-typed override map (kept loose in types.ts to avoid an
 * import cycle) to the real `DecisionBlockOverrides` shape decisionBlocks.ts expects. */
export function resolveDecisionBlockExtras(data: WorkflowNodeData): DecisionBlockExtras {
  const overrides = data.decisionBlockPromptOverrides as DecisionBlockOverrides | undefined;
  const styleTone = data.decisionStyleTone?.trim();
  return { ...(styleTone ? { styleTone } : {}), ...(overrides ? { overrides } : {}) };
}
