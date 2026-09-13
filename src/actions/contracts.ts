export type ActionScope = {
  saveId: string;
  branchId: string;
  turnId: string;
  catalogId: string;
};

export type SocialApp = 'fotogram' | 'onlyfriends';

export type ActionCapability =
  | 'whatsup.send' | 'whatsup.receive' | 'image.generate'
  // Presence means the character has an actual configured account on that app —
  // mirrors the existing legacy rule that a missing account cannot be invented.
  | 'fotogram.social' | 'onlyfriends.social';

export function socialCapability(app: SocialApp): 'fotogram.social' | 'onlyfriends.social' {
  return app === 'fotogram' ? 'fotogram.social' : 'onlyfriends.social';
}

type CatalogReference = {
  handle: string;
  id: string;
  saveId: string;
  branchId: string;
  state: 'available' | 'stale' | 'unavailable';
};

export type ActionCatalogEntry = CatalogReference & (
  | { kind: 'character'; capabilities: ActionCapability[]; allowedRecipientIds?: string[];
      /** Current bank balance, when the caller supplies one; absent means unchecked. */
      bankBalance?: number }
  | { kind: 'image'; accessibleTo: string[] }
);

// The application builds this catalog from authoritative state, never model text.
export type ActionCatalog = {
  scope: ActionScope;
  entries: ActionCatalogEntry[];
};

export type ImageGenerationAction = {
  type: 'image.generate';
  ownerId: string;
  description: string;
};

export type ImageBinding =
  | { type: 'artifact'; artifactId: string }
  | { type: 'operation-result'; operationId: string };

export type MessengerSendAction = {
  type: 'messenger.send';
  app: 'whatsup';
  fromId: string;
  toId: string;
  text: string;
  attachment?: ImageBinding;
  /** Renders as a lazily-synthesized spoken clip instead of plain text; delivery is unchanged. */
  isVoiceMessage?: boolean;
};

export type SocialPostAction = {
  type: 'social.post';
  app: SocialApp;
  authorId: string;
  caption: string;
};

export type SocialCommentAction = {
  type: 'social.comment';
  app: SocialApp;
  authorId: string;
  // Not catalog-validated at compile time (unlike character/image references):
  // existing-post identity is checked by the adapter against live app state at
  // execution time, since posts aren't (yet) enumerated in the compact catalog.
  postId: string;
  text: string;
};

export type BankTransferAction = {
  type: 'bank.transfer';
  fromId: string;
  toId: string;
  amount: number;
  note?: string;
};

export type NoteWriteAction = {
  type: 'note.write';
  ownerId: string;
  title: string;
  body: string;
  /** Omitted creates a new note; supplied updates the owner's existing note with this id. */
  noteId?: string;
};

export type AssistantChatMessage = { role: 'user' | 'assistant'; text: string };

export type AssistantChatAction = {
  type: 'assistant.chat';
  ownerId: string;
  /** 2 to 8 messages (1 to 4 exchanges), strictly alternating and starting with 'user'. */
  messages: AssistantChatMessage[];
};

export type CanonicalAction = ImageGenerationAction | MessengerSendAction | SocialPostAction | SocialCommentAction | BankTransferAction | NoteWriteAction | AssistantChatAction;

export type ValidatedOperation = {
  id: string;
  scope: ActionScope;
  replyBlockId: string;
  status: 'validated';
  dependsOn: string[];
  action: CanonicalAction;
};

export type PlannedReplyBlock =
  | { type: 'text'; id: string; text: string; provisional: true }
  | { type: 'action'; id: string; operationId: string };

export type ActionPlan = {
  version: 1;
  scope: ActionScope;
  blocks: PlannedReplyBlock[];
  operations: ValidatedOperation[];
};

export type ActionValidationIssue = {
  path: string;
  code: 'invalid-shape' | 'unknown-action' | 'unknown-reference' | 'ambiguous-reference'
    | 'wrong-reference-type' | 'unavailable-reference' | 'scope-mismatch'
    | 'access-denied' | 'unsupported-capability' | 'invalid-destination' | 'invalid-runtime-id';
  message: string;
};

export type ActionCompileResult =
  | { ok: true; plan: ActionPlan }
  | { ok: false; issues: ActionValidationIssue[] };
