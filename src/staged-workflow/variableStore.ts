import { assertReferenceType, type TurnScope, type VariableRecord, type VariableRef, type Visibility } from './contracts';

type WriteVariable = Omit<VariableRecord, 'ref' | 'scope'> & { id: string };
type Viewer = 'system' | { characterId: string };
const keyOf = (ref: VariableRef) => JSON.stringify([ref.id, ref.revision]);

function containsVisibility(source: Visibility, destination: Visibility) {
  if (destination.kind === 'system' || source.kind === 'shared') return true;
  if (source.kind !== 'characters' || destination.kind !== 'characters') return false;
  return destination.characterIds.every((id) => source.characterIds.includes(id));
}

export type SerializedVariableStore = {
  scope: TurnScope;
  maxRecords: number;
  maxCharacters: number;
  records: Array<[string, VariableRecord]>;
  latest: Array<[string, VariableRef]>;
  invalidated: string[];
  committed: string[];
  characters: number;
};

/** Turn-local storage only. Persistence, promotion and execution are separate owners. */
export class VariableStore {
  private readonly scope: TurnScope;
  private records = new Map<string, VariableRecord>();
  private latest = new Map<string, VariableRef>();
  private invalidated = new Set<string>();
  private committed = new Set<string>();
  private characters = 0;

  constructor(scope: TurnScope, private readonly maxRecords = 2048, private readonly maxCharacters = 2_000_000) {
    if (Object.values(scope).some((value) => typeof value !== 'string' || !value.trim())) throw new Error('Invalid turn scope.');
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || !Number.isSafeInteger(maxCharacters) || maxCharacters < 1) throw new Error('Invalid variable budget.');
    this.scope = { ...scope };
  }

  /** Every field here is already plain data (see the class's own fields) — this is a
   * straight dump, not a projection. Used to durably persist an in-progress staged turn
   * (S8 restart-recovery groundwork; see docs/handoff/2026-09-12-s8-restart-reconciliation-scoping.md). */
  serialize(): SerializedVariableStore {
    return {
      scope: { ...this.scope },
      maxRecords: this.maxRecords,
      maxCharacters: this.maxCharacters,
      records: [...this.records.entries()],
      latest: [...this.latest.entries()],
      invalidated: [...this.invalidated],
      committed: [...this.committed],
      characters: this.characters,
    };
  }

  static fromSerialized(data: SerializedVariableStore): VariableStore {
    const store = new VariableStore(data.scope, data.maxRecords, data.maxCharacters);
    store.records = new Map(data.records);
    store.latest = new Map(data.latest);
    store.invalidated = new Set(data.invalidated);
    store.committed = new Set(data.committed);
    store.characters = data.characters;
    return store;
  }

  private record(ref: VariableRef) {
    assertReferenceType(ref, ref.kind);
    if (ref.scope.saveId !== this.scope.saveId || ref.scope.branchId !== this.scope.branchId || ref.scope.turnId !== this.scope.turnId) throw new Error('Variable reference scope mismatch.');
    const record = this.records.get(keyOf(ref));
    if (!record) throw new Error('Missing variable revision.');
    if (record.ref.kind !== ref.kind) throw new Error('Variable reference type mismatch.');
    return record;
  }

  read(ref: VariableRef, scope: TurnScope, viewer: Viewer): VariableRecord {
    if (scope.saveId !== this.scope.saveId || scope.branchId !== this.scope.branchId || scope.turnId !== this.scope.turnId) throw new Error('Variable scope mismatch.');
    const record = this.record(ref);
    const visible = record.visibility;
    if (viewer !== 'system' && visible.kind !== 'shared' && (visible.kind !== 'characters' || !visible.characterIds.includes(viewer.characterId))) {
      throw new Error('Variable is not visible to this character.');
    }
    return structuredClone(record);
  }

  write(input: WriteVariable): VariableRef {
    const draft = structuredClone(input);
    if (!draft.id.trim()) throw new Error('Variable identity is required.');
    const previous = this.latest.get(draft.id);
    if (previous && this.committed.has(keyOf(previous))) throw new Error('Cannot revise a committed receipt.');
    if (previous && previous.kind !== draft.value.kind) throw new Error('Cannot change a variable type.');
    if (draft.producer.kind === 'stage' && draft.provenance === 'authoritative') throw new Error('Generated stage output cannot become authoritative.');
    if (draft.visibility.kind === 'characters' && (!draft.visibility.characterIds.length || draft.visibility.characterIds.some((id) => !id.trim()))) throw new Error('Invalid character visibility.');
    for (const ref of draft.inputs) {
      const record = this.record(ref);
      if (this.invalidated.has(keyOf(ref))) throw new Error('Cannot consume an invalidated revision.');
      if (!containsVisibility(record.visibility, draft.visibility)) throw new Error('Output visibility would disclose a private input.');
    }
    const ref: VariableRef = { id: draft.id, revision: (previous?.revision ?? 0) + 1, kind: draft.value.kind, scope: { ...this.scope } };
    const record: VariableRecord = {
      ref, scope: { ...this.scope }, value: draft.value, producer: draft.producer, inputs: draft.inputs,
      provenance: draft.provenance, visibility: draft.visibility, retention: draft.retention,
    };
    const size = JSON.stringify(record).length;
    if (this.records.size >= this.maxRecords || this.characters + size > this.maxCharacters) throw new Error('Turn variable retention budget exceeded.');
    // Commit the new revision only after every check; rejected writes are inert.
    this.records.set(keyOf(ref), record);
    this.latest.set(ref.id, ref);
    this.characters += size;
    if (previous) this.invalidateDependents(previous);
    return structuredClone(ref);
  }

  private invalidateDependents(source: VariableRef) {
    const pending = [keyOf(source)];
    for (let index = 0; index < pending.length; index++) {
      for (const [key, record] of this.records) {
        if (this.committed.has(key) || this.invalidated.has(key)) continue;
        if (record.inputs.some((input) => keyOf(input) === pending[index])) {
          this.invalidated.add(key);
          pending.push(key);
        }
      }
    }
  }

  markCommitted(ref: VariableRef) {
    const record = this.record(ref);
    if (this.latest.get(ref.id)?.revision !== ref.revision) throw new Error('Cannot commit a superseded receipt revision.');
    if (record.value.kind !== 'receipt' || this.invalidated.has(keyOf(ref))) throw new Error('Only a valid receipt can be marked committed.');
    this.committed.add(keyOf(ref));
  }

  isInvalidated(ref: VariableRef) {
    this.record(ref);
    return this.invalidated.has(keyOf(ref));
  }

  isLatest(ref: VariableRef) {
    this.record(ref);
    return this.latest.get(ref.id)?.revision === ref.revision;
  }

  isCommitted(ref: VariableRef) {
    this.record(ref);
    return this.committed.has(keyOf(ref));
  }
}
