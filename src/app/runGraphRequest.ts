import type {
  ChatImageAttachment,
  MessageRecord,
  SocialDirectMessageRecord,
  SocialPostRecord,
  SocialThreadActionRecord,
  TurnRecordMode,
} from '../types';
import type { StorybookCharacter } from '../storybook/runtime';
import type { TurnReplacement } from '../chat/useTurnRecordState';
import type { StructuredInputPayload } from '../chat/structuredCommands';
import type { SocialThreadRunContext } from '../chat/socialMedia';
import type { StagedRetryState } from '../staged-workflow/runLiveStagedTurn';

type RunGraphPhoneMessageSound = 'sent' | 'received';

export type RunGraphRequest = {
  inputText: string;
  images?: ChatImageAttachment[];
  existingInputMessage?: MessageRecord;
  historyMessages?: MessageRecord[];
  replacedMessageIds?: Set<number>;
  inputCharacterOverride?: StorybookCharacter;
  phoneMessageOverride?: boolean;
  phoneRecipientCharacterOverride?: StorybookCharacter;
  replacement?: TurnReplacement;
  turnMode?: TurnRecordMode;
  eventDisplayText?: string;
  onSuccessfulRunBeforeCommit?: () => void;
  phoneOutputSoundOverride?: RunGraphPhoneMessageSound;
  narratorAutoTurn?: boolean;
  messageFormatOverride?: number;
  turnModeOverride?: number;
  phoneReplyToOverride?: MessageRecord;
  structuredInput?: StructuredInputPayload;
  socialPost?: SocialPostRecord;
  socialThreadAction?: SocialThreadActionRecord;
  socialThreadContext?: SocialThreadRunContext;
  directActionOnly?: boolean;
  socialDirectMessage?: SocialDirectMessageRecord;
  contextComment?: string;
  /**
   * S8 restart recovery (second slice): resumes a durably persisted, previously-failed
   * staged/decision turn instead of planning/compiling a fresh one from `inputText` — see
   * App.tsx's `checkStagedRecoveryForSession`. When set, `inputText` and the other normal
   * input-driven fields are ignored by the resumed staged turn itself (though `inputText`
   * should still be passed as `''` since `runGraph` reads it before branching on this).
   * `sessionFileName` is the exact file the persisted record was read from — `runGraph`
   * uses it (not `stagedRecoveryAnchorRef`) for this run's own write-on-failure/clear-on-
   * success, since the ref can rotate to a different slot before the user even clicks Retry
   * (a redundant autosave fires almost immediately after a restore, in a fresh renderer
   * where `lastTurnAutosaveIdRef` has reset) — using the ref here would silently target the
   * wrong file and leave the real record orphaned.
   */
  resumeStagedRetry?: { retry: StagedRetryState; sessionFileName: string };
};

export type NormalizedRunGraphRequest = RunGraphRequest & {
  images: ChatImageAttachment[];
  directActionOnly: boolean;
  isPhoneMessage: boolean;
};

export function normalizeRunGraphRequest(request: RunGraphRequest): NormalizedRunGraphRequest {
  return {
    ...request,
    images: request.images ?? [],
    directActionOnly: request.directActionOnly ?? false,
    isPhoneMessage: request.phoneMessageOverride ?? false,
  };
}
