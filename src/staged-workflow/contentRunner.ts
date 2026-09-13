import { finalReplyText } from '../llm/finalReply';
import type { NodeLlmApi } from '../llm/NodeLlmApi';
import type { NodeLlmRequest } from '../llm/types';
import type { StageExecutionInput, StagedSchedulerAdapters } from './scheduler';
import type { VariableRecord, VariableValue } from './contracts';

export type StagedContentRunnerOptions = {
  connectionId?: string;
  maxTokens?: number;
  temperature?: number;
  useConnectionSampling?: boolean;
  fastTask?: boolean;
};

type StagedContentLlm = Pick<NodeLlmApi, 'complete'>;

function valueText(value: VariableValue): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'facts':
      return value.facts.map((fact) => `- ${fact.text} (${fact.sourceId})`).join('\n');
    case 'entity':
      return `${value.entityType}:${value.entityId}`;
    case 'artifact':
      return `${value.mediaType} artifact:${value.artifactId}`;
    case 'receipt':
      return `receipt:${value.receiptId} operation:${value.operationId}`;
    case 'plan':
      return value.events.map((event) =>
        `- ${event.purpose}${event.participants.length ? ` [${event.participants.join(', ')}]` : ''}`,
      ).join('\n');
    case 'messages':
      return value.messages.map((message) => `${message.role}: ${message.text}`).join('\n');
  }
}

function recordSection(record: VariableRecord, index: number) {
  return [
    `Input ${index + 1}: ${record.ref.id}@${record.ref.revision} (${record.ref.kind}, ${record.provenance})`,
    valueText(record.value),
  ].join('\n');
}

const messagesOutputInstruction = [
  'Return only a JSON array of 2 to 8 message objects (1 to 4 alternating exchanges), each',
  '`{"role": "user" | "assistant", "text": "..."}`, strictly alternating and starting with "user".',
  'Do not wrap the array in another object, and do not emit prose, tool calls, receipts, or hidden plan markers.',
].join(' ');
const textOutputInstruction = [
  'Return only the requested draft text. Do not emit JSON, tool calls, receipts, or hidden plan markers.',
].join(' ');

export function stagedContentPrompt({ stage, inputs, instruction }: StageExecutionInput): string {
  return [
    'RPGraph staged workflow content pass.',
    `Stage: ${stage.recipeId}/${stage.key}`,
    `Actor: ${stage.actorId}`,
    `Purpose: produce ${stage.output.kind} output for this stage only.`,
    Object.keys(stage.lockedArguments).length
      ? `Locked arguments:\n${JSON.stringify(stage.lockedArguments, null, 2)}`
      : '',
    '',
    instruction ? ['Instructions:', valueText(instruction.value), ''].join('\n') : '',
    'Selected inputs:',
    ...inputs.map(recordSection),
    '',
    stage.output.kind === 'messages' ? messagesOutputInstruction : textOutputInstruction,
    'Do not change locked actors, recipients, owners, accounts, amounts, destinations, or artifact identities.',
  ].filter(Boolean).join('\n');
}

export function createStagedContentAdapter(
  llm: StagedContentLlm,
  options: StagedContentRunnerOptions = {},
): StagedSchedulerAdapters['generateContent'] {
  return async (input) => {
    const request: NodeLlmRequest = {
      connectionId: options.connectionId,
      prompt: stagedContentPrompt(input),
      label: `Staged content: ${input.stage.recipeId}/${input.stage.key}`,
      stage: { kind: 'step', name: `Staged ${input.stage.recipeId}/${input.stage.key}` },
      nodeId: input.stage.id,
      purpose: 'Staged workflow content generation',
      signal: input.signal,
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.useConnectionSampling !== undefined ? { useConnectionSampling: options.useConnectionSampling } : {}),
      ...(options.fastTask !== undefined ? { fastTask: options.fastTask } : {}),
    };
    const result = await llm.complete(request);
    return finalReplyText(result.text).trim();
  };
}
