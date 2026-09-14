import { assertStageKind, type DependencyKind, type StageKind, type TurnContext, type TurnPlan,
  type TurnScope, type VariableKind, type VariableRecord, type VariableRef, type Visibility } from './contracts';
import type { VariableStore } from './variableStore';

type Arguments = Record<string, string | number | boolean>;
type Initiator = 'model' | 'direct-user';
type Catalog = { scope: TurnScope; revision: string; characterIds: string[] };
export type RecipeDefinition = {
  id: string;
  description: string;
  initiators: Initiator[];
  inputs: Record<string, VariableKind>;
  arguments: Record<string, 'string' | 'number' | 'boolean'>;
  retryPolicy: 'reconcile-before-retry' | 'regenerate-draft-only' | 'not-enabled';
  /** Declarative expansion only. No executor or provider callback enters preflight. */
  steps: Array<{ key: string; kind: StageKind; output: VariableKind; inputs: string[]; instruction?: string; generations: number }>;
  /** Trusted, pure family-specific identity/capability/permission checks; throw on denial. */
  validate: (input: { args: Arguments; actorId: string; catalog: Catalog; initiator: Initiator;
    inputs: Record<string, { binding: CompiledBinding; record?: VariableRecord }> }) => void;
};
export type CompileOptions = {
  context: TurnContext;
  store: VariableStore;
  catalog: Catalog;
  recipes: readonly RecipeDefinition[];
  initiator: Initiator;
  directActions?: Array<{ id: string; recipe: string; actorId: string; args: Arguments }>;
  limits: TurnPlan['limits'];
  allocateId: () => string;
};
type PlannedBinding = { source: 'variable'; ref: VariableRef }
  | { source: 'output'; instanceId: string; output: string; kind: VariableKind };
export type CompiledBinding = { source: 'variable'; ref: VariableRef }
  | { source: 'output'; stageId: string; outputId: string; kind: VariableKind };
type Instance = { id: string; recipe: string; purpose: string; actorId: string; visibility: Visibility; args: Arguments;
  inputs: Record<string, PlannedBinding>; dependencies: Array<{ instanceId: string; kind: DependencyKind }> };
type CompactTurnPlan = { version: 'staged-v1'; catalogRevision: string; continuations: number; instances: Instance[];
  beats: Array<{ id: string; speakerId?: string; visibility: Visibility; content: PlannedBinding[]; requiresReceipts: PlannedBinding[] }> };
export type CompiledStage = { id: string; instanceId: string; recipeId: string; key: string; kind: StageKind; actorId: string;
  visibility: Visibility; lockedArguments: Arguments; retryPolicy: RecipeDefinition['retryPolicy']; inputs: CompiledBinding[]; instruction?: CompiledBinding;
  output: { id: string; kind: VariableKind }; dependencies: Array<{ stageId: string; kind: DependencyKind }> };
export type CompiledTurnPlan = { version: 'staged-v1'; context: TurnContext; stages: CompiledStage[]; executionOrder: string[];
  scene: Array<{ id: string; alias: string; purpose: string; actorId: string; recipeId: string; lockedArguments: Arguments }>;
  beats: Array<{ id: string; alias: string; speakerId?: string; visibility: Visibility; content: CompiledBinding[]; requiresReceipts: CompiledBinding[] }>;
  limits: TurnPlan['limits']; cost: TurnPlan['limits'] };
export type PlanCompileResult = { ok: true; plan: CompiledTurnPlan } | { ok: false; issues: Array<{ path: string; message: string }> };

const kinds: VariableKind[] = ['text', 'facts', 'entity', 'artifact', 'receipt', 'plan', 'messages'];
const generateContentOutputKinds: VariableKind[] = ['text', 'messages'];
const dependencyKinds: DependencyKind[] = ['content', 'artifact', 'state', 'observation', 'presentation', 'user-input'];
export const hardLimits = { beats: 128, calls: 128, generations: 16, continuations: 8 };
export const maxPlanCharacters = 262144;
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object.');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  check(required.every((key) => Object.prototype.hasOwnProperty.call(value, key)), 'Missing required field.');
  check(Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), 'Unknown field.');
}
function string(value: unknown, max = 2048): string {
  check(typeof value === 'string' && !!value.trim() && value.length <= max, 'Expected a bounded nonempty string.');
  return value;
}
function alias(value: unknown): string {
  const result = string(value, 64);
  check(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(result), 'Invalid local alias.');
  return result;
}
function integer(value: unknown, max: number): number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max, 'Invalid or exceeded budget.');
  return value;
}
function list(value: unknown, max = 128): unknown[] {
  check(Array.isArray(value) && value.length <= max, 'Expected a bounded array.');
  return value;
}
function kind(value: unknown): VariableKind {
  check(kinds.includes(value as VariableKind), 'Unknown variable kind.');
  return value as VariableKind;
}
function scope(value: unknown): TurnScope {
  const v = object(value); fields(v, ['saveId', 'branchId', 'turnId']);
  return { saveId: string(v.saveId), branchId: string(v.branchId), turnId: string(v.turnId) };
}
function sameScope(a: TurnScope, b: TurnScope) {
  return a.saveId === b.saveId && a.branchId === b.branchId && a.turnId === b.turnId;
}
function visibility(value: unknown, catalog: Catalog): Visibility {
  const v = object(value);
  if (v.kind === 'system' || v.kind === 'shared') { fields(v, ['kind']); return { kind: v.kind }; }
  fields(v, ['kind', 'characterIds']);
  check(v.kind === 'characters', 'Unknown visibility.');
  const ids = list(v.characterIds).map((id) => character(id, catalog));
  check(ids.length && new Set(ids).size === ids.length, 'Empty or duplicate audience.');
  return { kind: 'characters', characterIds: ids };
}
function character(value: unknown, catalog: Catalog) {
  const id = string(value);
  check(catalog.characterIds.includes(id), 'Unknown character identity.');
  return id;
}
function canDisclose(source: Visibility, destination: Visibility) {
  return destination.kind === 'system' || source.kind === 'shared'
    || (source.kind === 'characters' && destination.kind === 'characters' && destination.characterIds.every((id) => source.characterIds.includes(id)));
}
function binding(value: unknown): PlannedBinding {
  const v = object(value);
  if (v.source === 'variable') {
    fields(v, ['source', 'ref']);
    const r = object(v.ref); fields(r, ['id', 'revision', 'kind', 'scope']);
    const revision = integer(r.revision, Number.MAX_SAFE_INTEGER); check(revision > 0, 'Expected a realized revision.');
    return { source: 'variable', ref: { id: string(r.id), revision, kind: kind(r.kind), scope: scope(r.scope) } };
  }
  fields(v, ['source', 'instanceId', 'output', 'kind']); check(v.source === 'output', 'Unknown binding source.');
  return { source: 'output', instanceId: alias(v.instanceId), output: alias(v.output), kind: kind(v.kind) };
}
function args(value: unknown): Arguments {
  const v = object(value); check(Object.keys(v).length <= 32, 'Too many arguments.');
  return Object.fromEntries(Object.entries(v).map(([key, val]) => {
    alias(key);
    check(typeof val === 'boolean' || (typeof val === 'number' && Number.isFinite(val))
      || (typeof val === 'string' && val.length <= 2048), 'Expected a scalar locked argument.');
    return [key, val as string | number | boolean];
  }));
}

/** Strict bounded JSON boundary; no raw model object is cast into internal contracts. Reports precise
 * failure paths (e.g. "beats.b2.requiresReceipts[0]") via setPath, since these are fed back to the
 * model on a compile-failed retry and a generic "plan" path is useless feedback. */
function parse(input: unknown, catalog: Catalog, setPath: (path: string) => void): CompactTurnPlan {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  check(typeof raw === 'string' && raw.length <= maxPlanCharacters, 'Plan size budget exceeded.');
  const p = object(JSON.parse(raw));
  fields(p, ['version', 'catalogRevision', 'continuations', 'instances', 'beats']);
  check(p.version === 'staged-v1', 'Unknown plan version.');
  check(p.catalogRevision === catalog.revision, 'Stale catalog revision.');
  setPath('continuations');
  const continuations = integer(p.continuations, hardLimits.continuations);
  const instances = list(p.instances, 64).map((value, index): Instance => {
    setPath(`instances[${index}]`);
    const v = object(value); fields(v, ['id', 'recipe', 'purpose', 'actorId', 'visibility', 'args', 'inputs', 'dependencies']);
    setPath(`instances[${index}].id`);
    const id = alias(v.id);
    setPath(`instances.${id}.recipe`);
    const recipe = string(v.recipe);
    setPath(`instances.${id}.purpose`);
    const purpose = string(v.purpose, 512);
    setPath(`instances.${id}.actorId`);
    const actorId = character(v.actorId, catalog);
    setPath(`instances.${id}.visibility`);
    const instanceVisibility = visibility(v.visibility, catalog);
    setPath(`instances.${id}.args`);
    const instanceArgs = args(v.args);
    setPath(`instances.${id}.inputs`);
    const inputs = object(v.inputs); check(Object.keys(inputs).length <= 32, 'Too many selected inputs.');
    const boundInputs = Object.fromEntries(Object.entries(inputs).map(([name, val]) => {
      setPath(`instances.${id}.inputs.${name}`);
      return [alias(name), binding(val)];
    }));
    setPath(`instances.${id}.dependencies`);
    const dependencies = list(v.dependencies).map((dep, depIndex) => {
      setPath(`instances.${id}.dependencies[${depIndex}]`);
      const d = object(dep); fields(d, ['instanceId', 'kind']);
      check(dependencyKinds.includes(d.kind as DependencyKind), 'Unknown dependency kind.');
      return { instanceId: alias(d.instanceId), kind: d.kind as DependencyKind };
    });
    return { id, recipe, purpose, actorId, visibility: instanceVisibility, args: instanceArgs, inputs: boundInputs, dependencies };
  });
  const beats = list(p.beats).map((value, index) => {
    setPath(`beats[${index}]`);
    const v = object(value); fields(v, ['id', 'visibility', 'content', 'requiresReceipts'], ['speakerId']);
    setPath(`beats[${index}].id`);
    const id = alias(v.id);
    setPath(`beats.${id}.visibility`);
    const beatVisibility = visibility(v.visibility, catalog);
    setPath(`beats.${id}.content`);
    const content = list(v.content, 32).map((ref, refIndex) => {
      setPath(`beats.${id}.content[${refIndex}]`);
      return binding(ref);
    });
    setPath(`beats.${id}.requiresReceipts`);
    const requiresReceipts = list(v.requiresReceipts, 32).map((ref, refIndex) => {
      setPath(`beats.${id}.requiresReceipts[${refIndex}]`);
      return binding(ref);
    });
    let speakerId: string | undefined;
    if (v.speakerId !== undefined) { setPath(`beats.${id}.speakerId`); speakerId = character(v.speakerId, catalog); }
    return { id, visibility: beatVisibility, content, requiresReceipts, ...(speakerId === undefined ? {} : { speakerId }) };
  });
  setPath('plan');
  return { version: 'staged-v1', catalogRevision: catalog.revision, continuations, instances, beats };
}

/** Trusted registrations are still checked for ambiguous names and unsupported stages. */
export function validatePlanEnvironment(options: CompileOptions) {
  const { context, catalog, store } = options;
  check(sameScope(scope(context.scope), scope(catalog.scope)) && context.catalogRevision === catalog.revision, 'Catalog scope/revision mismatch.');
  string(catalog.revision);
  check(new Set(catalog.characterIds).size === catalog.characterIds.length, 'Ambiguous catalog characters.');
  catalog.characterIds.forEach((id) => string(id));
  check(options.initiator === 'model' || options.initiator === 'direct-user', 'Unknown initiator.');
  for (const key of Object.keys(hardLimits) as Array<keyof typeof hardLimits>) integer(options.limits[key], hardLimits[key]);
  for (const [ref, expected] of [[context.GH, 'facts'], [context.LM, 'facts'], [context.OC, 'facts'],
    ...Object.values(context.instructions).map((ref) => [ref, 'text'] as const)] as const) {
    const record = store.read(ref, context.scope, 'system');
    check(ref.kind === expected && !store.isInvalidated(ref), 'Invalid context revision/type.');
    if (ref === context.OC) check(record.provenance === 'authoritative', 'OC must be authoritative.');
  }
  const ids = new Set<string>();
  for (const recipe of options.recipes) {
    string(recipe.id); check(!ids.has(recipe.id), 'Duplicate recipe registration.'); ids.add(recipe.id);
    check(typeof recipe.validate === 'function', 'Recipe requires a pure validator.');
    check(recipe.initiators.length > 0 && recipe.initiators.every((i) => i === 'model' || i === 'direct-user'), 'Invalid recipe initiators.');
    check(recipe.steps.length > 0 && recipe.steps.length <= 16, 'Invalid recipe expansion size.');
    const available = new Map<string, VariableKind>();
    for (const [name, type] of Object.entries(recipe.inputs)) available.set(alias(name), kind(type));
    for (const [name, type] of Object.entries(recipe.arguments)) {
      alias(name); check(['string', 'number', 'boolean'].includes(type), 'Unknown argument type.');
    }
    for (const step of recipe.steps) {
      alias(step.key); assertStageKind(step.kind); kind(step.output); integer(step.generations, 1);
      check(!available.has(step.key), 'Duplicate recipe input/output name.');
      check(step.inputs.every((name) => available.has(name)) && new Set(step.inputs).size === step.inputs.length, 'Invalid recipe input selection.');
      if (step.instruction) check(available.get(step.instruction) === 'text', 'Instruction must select a preceding text input.');
      if (step.kind === 'generate-content') check(!!step.instruction && generateContentOutputKinds.includes(step.output), 'Content writers require instructions and text or messages output.');
      check(step.output !== 'receipt' || step.kind === 'execute-action', 'Only actions produce receipts.');
      available.set(step.key, step.output);
    }
  }
}

/** Pure preflight: no adapters, calls, store writes, or publication. IDs allocate only after validation. */
export function compileTurnPlan(input: unknown, options: CompileOptions): PlanCompileResult {
  let path = 'plan';
  try {
    validatePlanEnvironment(options);
    const parsed = parse(input, options.catalog, (p) => { path = p; });
    const instances = new Map(parsed.instances.map((i) => [i.id, i]));
    check(instances.size === parsed.instances.length, 'Duplicate instance alias.');
    check(new Set(parsed.beats.map((b) => b.id)).size === parsed.beats.length, 'Duplicate beat alias.');
    if (options.initiator === 'direct-user') {
      const direct = options.directActions;
      check(direct && direct.length === instances.size && new Set(direct.map((d) => d.id)).size === direct.length, 'Direct actions must match the trusted request exactly.');
      for (const action of direct) {
        const instance = instances.get(action.id);
        check(instance && instance.recipe === action.recipe && instance.actorId === action.actorId
          && Object.keys(instance.args).length === Object.keys(action.args).length
          && Object.entries(action.args).every(([key, value]) => Object.prototype.hasOwnProperty.call(instance.args, key) && instance.args[key] === value), 'Direct-user locked arguments changed.');
      }
    } else check(!options.directActions?.length, 'Direct actions cannot use speculative planning.');
    const recipes = new Map(options.recipes.map((r) => [r.id, r]));
    const stages: CompiledStage[] = [];
    const outputs = new Map<string, CompiledStage>();
    const stageKey = (instanceId: string, output: string) => `stage/${instanceId}/${output}`;
    const cost = { beats: parsed.beats.length, calls: 0, generations: 0, continuations: parsed.continuations };
    for (const instance of parsed.instances) {
      path = `instances.${instance.id}`;
      const recipe = recipes.get(instance.recipe);
      check(recipe && recipe.initiators.includes(options.initiator), 'Recipe is not registered for this initiator.');
      fields(instance.args, Object.keys(recipe.arguments));
      check(Object.entries(recipe.arguments).every(([key, type]) => typeof instance.args[key] === type), 'Wrong locked argument type.');
      fields(instance.inputs, Object.keys(recipe.inputs));
      check(canDisclose(instance.visibility, { kind: 'characters', characterIds: [instance.actorId] }), 'Actor cannot read its own stage output.');
      for (const step of recipe.steps) {
        const id = stageKey(instance.id, step.key);
        const stage: CompiledStage = { id, instanceId: instance.id, recipeId: recipe.id, key: step.key, kind: step.kind,
          actorId: instance.actorId, visibility: instance.visibility, lockedArguments: instance.args, retryPolicy: recipe.retryPolicy,
          inputs: [], output: { id: `${id}/output`, kind: step.output }, dependencies: [] };
        stages.push(stage); outputs.set(id, stage);
        if (step.kind === 'generate-content' || step.kind === 'plan') cost.calls++;
        cost.generations += step.generations;
      }
    }
    check(stages.length <= 256, 'Expanded stage budget exceeded.');
    for (const key of Object.keys(cost) as Array<keyof typeof cost>) check(cost[key] <= options.limits[key], `${key} budget exceeded.`);

    function resolve(ref: PlannedBinding, audience: Visibility, actorId?: string, expected?: VariableKind): CompiledBinding {
      let actual: VariableKind;
      let visible: Visibility;
      let result: CompiledBinding;
      if (ref.source === 'variable') {
        const record = options.store.read(ref.ref, options.context.scope, actorId ? { characterId: actorId } : 'system');
        check(!options.store.isInvalidated(ref.ref), 'Cannot consume invalidated revision.');
        actual = ref.ref.kind; visible = record.visibility; result = ref;
      } else {
        const producer = outputs.get(stageKey(ref.instanceId, ref.output));
        check(producer && producer.output.kind === ref.kind, 'Dangling or wrong-type output binding.');
        actual = ref.kind; visible = producer.visibility;
        result = { source: 'output', stageId: producer.id, outputId: producer.output.id, kind: actual };
      }
      check(!expected || actual === expected, 'Wrong selected input type.');
      check(canDisclose(visible, audience) && (!actorId || canDisclose(visible, { kind: 'characters', characterIds: [actorId] })), 'Input would disclose private knowledge.');
      return result;
    }
    function dependency(stage: CompiledStage, stageId: string, kind: DependencyKind) {
      if (!stage.dependencies.some((d) => d.stageId === stageId && d.kind === kind)) stage.dependencies.push({ stageId, kind });
    }
    for (const instance of parsed.instances) {
      path = `instances.${instance.id}.inputs`;
      const recipe = recipes.get(instance.recipe)!;
      const selected = new Map(Object.entries(instance.inputs).map(([name, ref]) => [name, resolve(ref, instance.visibility, instance.actorId, recipe.inputs[name])]));
      recipe.validate({ args: structuredClone(instance.args), actorId: instance.actorId, catalog: structuredClone(options.catalog), initiator: options.initiator,
        inputs: Object.fromEntries([...selected].map(([name, ref]) => [name, { binding: structuredClone(ref),
          ...(ref.source === 'variable' ? { record: options.store.read(ref.ref, options.context.scope, { characterId: instance.actorId }) } : {}) }])) });
      const declared = new Set<string>();
      for (const dep of instance.dependencies) {
        const key = `${dep.instanceId}/${dep.kind}`;
        check(!declared.has(key), 'Duplicate dependency.'); declared.add(key);
        check(instances.has(dep.instanceId), 'Dangling dependency.');
      }
      for (const step of recipe.steps) {
        const stage = outputs.get(stageKey(instance.id, step.key))!;
        stage.inputs = step.inputs.map((name) => selected.get(name)!);
        if (step.instruction) stage.instruction = selected.get(step.instruction)!;
        for (const ref of [...stage.inputs, ...(stage.instruction ? [stage.instruction] : [])]) {
          if (ref.source === 'output') dependency(stage, ref.stageId, ref.kind === 'receipt' ? 'observation' : ref.kind === 'artifact' ? 'artifact' : 'content');
        }
        for (const dep of instance.dependencies) {
          // An instance dependency waits for all outputs, including hidden actions.
          for (const source of stages.filter((s) => s.instanceId === dep.instanceId)) dependency(stage, source.id, dep.kind);
        }
        selected.set(step.key, { source: 'output', stageId: stage.id, outputId: stage.output.id, kind: stage.output.kind });
      }
    }
    path = 'beats';
    const beats = parsed.beats.map((beat) => ({ id: `beat/${beat.id}`, alias: beat.id, visibility: beat.visibility,
      ...(beat.speakerId ? { speakerId: beat.speakerId } : {}),
      content: beat.content.map((ref) => resolve(ref, beat.visibility, beat.speakerId)),
      requiresReceipts: beat.requiresReceipts.map((ref) => resolve(ref, beat.visibility, beat.speakerId, 'receipt')) }));
    path = 'dependencies';
    const executionOrder: string[] = [];
    const done = new Set<string>();
    while (done.size < stages.length) {
      const ready = stages.find((stage) => !done.has(stage.id) && stage.dependencies.every((dep) => done.has(dep.stageId)));
      check(ready, 'Dependency cycle.'); done.add(ready.id); executionOrder.push(ready.id);
    }
    path = 'runtime.id';
    const ids = new Map<string, string>(); const used = new Set<string>();
    for (const key of [...parsed.instances.map((i) => `instance/${i.id}`), ...stages.flatMap((s) => [s.id, s.output.id]), ...beats.map((b) => b.id)]) {
      const id = string(options.allocateId()); check(!used.has(id), 'Duplicate runtime identity.'); used.add(id); ids.set(key, id);
    }
    const remap = (ref: CompiledBinding): CompiledBinding => ref.source === 'variable' ? ref
      : { ...ref, stageId: ids.get(ref.stageId)!, outputId: ids.get(ref.outputId)! };
    return { ok: true, plan: structuredClone({ version: 'staged-v1', context: options.context, limits: options.limits, cost,
      scene: parsed.instances.map((i) => ({ id: ids.get(`instance/${i.id}`)!, alias: i.id, purpose: i.purpose, actorId: i.actorId, recipeId: i.recipe, lockedArguments: i.args })),
      stages: stages.map((s) => ({ ...s, id: ids.get(s.id)!, instanceId: ids.get(`instance/${s.instanceId}`)!, inputs: s.inputs.map(remap),
        ...(s.instruction ? { instruction: remap(s.instruction) } : {}), output: { ...s.output, id: ids.get(s.output.id)! },
        dependencies: s.dependencies.map((d) => ({ ...d, stageId: ids.get(d.stageId)! })) })),
      executionOrder: executionOrder.map((id) => ids.get(id)!),
      beats: beats.map((b) => ({ ...b, id: ids.get(b.id)!, content: b.content.map(remap), requiresReceipts: b.requiresReceipts.map(remap) })) }) };
  } catch (error) {
    return { ok: false, issues: [{ path, message: error instanceof Error ? error.message : 'Invalid plan.' }] };
  }
}
