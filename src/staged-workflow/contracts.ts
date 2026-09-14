export type TurnScope = { saveId: string; branchId: string; turnId: string };
export type VariableKind = 'text' | 'facts' | 'entity' | 'artifact' | 'receipt' | 'plan' | 'messages';
export type VariableRef = { id: string; revision: number; kind: VariableKind; scope: TurnScope };
export type Visibility = { kind: 'system' } | { kind: 'shared' } | { kind: 'characters'; characterIds: string[] };
export type VariableValue =
  | { kind: 'text'; text: string }
  | { kind: 'facts'; facts: Array<{ text: string; sourceId: string }> }
  | { kind: 'entity'; entityId: string; entityType: string }
  | { kind: 'artifact'; artifactId: string; mediaType: 'image' | 'audio' | 'video' }
  | { kind: 'receipt'; operationId: string; receiptId: string }
  | { kind: 'plan'; events: Array<{ purpose: string; participants: string[] }> }
  | { kind: 'messages'; messages: Array<{ role: 'user' | 'assistant'; text: string }> };

export type VariableRecord = {
  ref: VariableRef;
  scope: TurnScope;
  value: VariableValue;
  producer: { kind: 'context'; sourceId: string } | { kind: 'stage'; stageId: string };
  inputs: VariableRef[];
  provenance: 'authoritative' | 'observed' | 'generated';
  visibility: Visibility;
  retention: 'draft' | 'turn' | 'promoted';
};

export type TurnContext = {
  scope: TurnScope;
  catalogRevision: string;
  GH: VariableRef;
  LM: VariableRef;
  OC: VariableRef;
  instructions: Record<string, VariableRef>;
};

const stageKinds = ['retrieve', 'plan', 'generate-content', 'execute-action', 'compose', 'await-user'] as const;
export type StageKind = typeof stageKinds[number];
export type DependencyKind = 'content' | 'artifact' | 'state' | 'observation' | 'presentation' | 'user-input';
type StageDefinition = {
  id: string;
  kind: StageKind;
  inputs: VariableRef[];
  outputs: Array<{ id: string; kind: VariableKind }>;
  dependencies: Array<{ stageId: string; kind: DependencyKind }>;
  instructions?: VariableRef;
  providerId?: string;
  recipeId?: string;
};
type BeatDefinition = {
  id: string;
  speakerId?: string;
  content: VariableRef[];
  visibility: Visibility;
  requiresReceipts: VariableRef[];
};
export type TurnPlan = {
  version: 'staged-v1';
  context: TurnContext;
  stages: StageDefinition[];
  beats: BeatDefinition[];
  lockedArguments: Record<string, Record<string, string | number | boolean>>;
  limits: { beats: number; calls: number; generations: number; continuations: number };
};

export function assertStageKind(value: unknown): asserts value is StageKind {
  if (typeof value !== 'string' || !(stageKinds as readonly string[]).includes(value)) {
    throw new Error('Unknown staged-workflow stage kind.');
  }
}

export function assertReferenceType(reference: VariableRef, expected: VariableKind) {
  if (!reference.id.trim() || !Number.isSafeInteger(reference.revision) || reference.revision < 1 || reference.kind !== expected) {
    throw new Error(`Expected a versioned ${expected} variable reference.`);
  }
}
