export type ActionScope = {
  saveId: string;
  branchId: string;
  turnId: string;
  catalogId: string;
};

export type ActionCapability = 'whatsup.send' | 'whatsup.receive' | 'image.generate';

type CatalogReference = {
  handle: string;
  id: string;
  saveId: string;
  branchId: string;
  state: 'available' | 'stale' | 'unavailable';
};

export type ActionCatalogEntry = CatalogReference & (
  | { kind: 'character'; capabilities: ActionCapability[] }
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
};

export type CanonicalAction = ImageGenerationAction | MessengerSendAction;

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
