import type { EmbeddedPhoneMessageLink, MessageRecord, TurnContext, WorkflowVariableSetCommand } from '../types';
import { canonicalPhoneName, type ParsedPhoneMessage } from '../chat/phoneMessages';
import { rpPicturePhoneAttachment } from '../chat/rpPictures';

export type PhoneOutputCommit = {
  type: 'append-phone-message';
  payload: ParsedPhoneMessage;
  sound?: 'sent' | 'received';
  phoneAutoTurnSource?: MessageRecord['phoneAutoTurnSource'];
  workflowVariableSetCommands?: WorkflowVariableSetCommand[];
  includeSourceOrder?: boolean;
};

export type PhoneOutputCommitInput = {
  phoneCharacters: { name: string }[];
  replies: readonly ParsedPhoneMessage[];
  existingMessages: readonly MessageRecord[];
  resolveRpPictures?: boolean;
  firstSound?: PhoneOutputCommit['sound'];
  phoneAutoTurnSource?: PhoneOutputCommit['phoneAutoTurnSource'];
  workflowVariableSetCommands?: WorkflowVariableSetCommand[];
  turnContext?: TurnContext;
  includeSourceOrder?: boolean;
  /** Account-id-resolved from/to, when the caller already has it (e.g. from
   * `resolveWhatsUpMessageParticipants`) — used instead of the fuzzy `canonicalPhoneName`
   * lookup so the stored message carries the exact account the reply was resolved against. */
  resolvedParticipants?: { from: { name: string; accountId?: string }; to: { name: string; accountId?: string } };
};

// Compatibility projection only. Legacy name recovery and unresolved gallery
// IDs deliberately retain their existing behavior until the typed runtime opts in.
export function buildPhoneOutputCommits(input: PhoneOutputCommitInput): PhoneOutputCommit[] {
  return input.replies.map((reply, index) => {
    const payload: ParsedPhoneMessage = {
      ...reply,
      from: input.resolvedParticipants?.from.name ?? canonicalPhoneName(input.phoneCharacters, reply.from),
      to: input.resolvedParticipants?.to.name ?? canonicalPhoneName(input.phoneCharacters, reply.to),
      ...(input.resolvedParticipants?.from.accountId ? { fromAccountId: input.resolvedParticipants.from.accountId } : {}),
      ...(input.resolvedParticipants?.to.accountId ? { toAccountId: input.resolvedParticipants.to.accountId } : {}),
      ...(input.turnContext ? { turnContext: input.turnContext } : {}),
    };
    if (input.resolveRpPictures) {
      const picture = rpPicturePhoneAttachment(input.existingMessages, payload.imageId);
      payload.imageId = picture?.id ?? payload.imageId;
      payload.imageDescription = picture?.description;
      payload.imageAttachments = picture ? [picture] : undefined;
    }
    return {
      type: 'append-phone-message', payload,
      sound: index === 0 ? input.firstSound : undefined,
      phoneAutoTurnSource: input.phoneAutoTurnSource,
      workflowVariableSetCommands: index === 0 && input.workflowVariableSetCommands?.length
        ? structuredClone(input.workflowVariableSetCommands) : undefined,
      includeSourceOrder: input.includeSourceOrder,
    };
  });
}

export type PhoneOutputCommitCallbacks = {
  appendPhoneMessage: (message: ParsedPhoneMessage, sound?: PhoneOutputCommit['sound'], role?: 'output',
    phoneAutoTurnSource?: PhoneOutputCommit['phoneAutoTurnSource'], commands?: WorkflowVariableSetCommand[]) => number;
};

export function applyPhoneOutputCommits(commits: readonly PhoneOutputCommit[], callbacks: PhoneOutputCommitCallbacks): EmbeddedPhoneMessageLink[] {
  return commits.map((commit) => {
    const phoneMessageId = callbacks.appendPhoneMessage(commit.payload, commit.sound, 'output', commit.phoneAutoTurnSource, commit.workflowVariableSetCommands);
    return { phoneMessageId, from: commit.payload.from, to: commit.payload.to, message: commit.payload.message,
      translatedMessage: commit.payload.translatedMessage,
      ...(commit.includeSourceOrder ? { sourceOrder: commit.payload.sourceOrder } : {}),
    };
  });
}
