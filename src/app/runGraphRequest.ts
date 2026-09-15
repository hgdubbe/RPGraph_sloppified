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
