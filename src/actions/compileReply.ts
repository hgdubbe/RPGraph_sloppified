import type {
  ActionCatalog, ActionCatalogEntry, ActionCompileResult, ActionPlan, ActionScope,
  ActionValidationIssue, ImageGenerationAction, MessengerSendAction,
} from './contracts';

type PreparedAction =
  | ImageGenerationAction
  | (MessengerSendAction & { generation?: ImageGenerationAction });
type PreparedBlock = { type: 'text'; text: string } | { type: 'action'; action: PreparedAction };

class InvalidAction extends Error {
  constructor(readonly issue: ActionValidationIssue) {
    super(issue.message);
  }
}

function reject(path: string, code: ActionValidationIssue['code'], message: string): never {
  throw new InvalidAction({ path, code, message });
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject(path, 'invalid-shape', 'Expected an object in a complete reply envelope.');
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) reject(`${path}.${key}`, 'invalid-shape', `Unexpected field "${key}".`);
  }
}

function string(value: unknown, path: string, limit = 128, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim())) {
    reject(path, 'invalid-shape', `Expected ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${limit} characters.`);
  }
  return value;
}

function reference<K extends ActionCatalogEntry['kind']>(
  value: unknown, kind: K, catalog: ActionCatalog, scope: ActionScope, path: string,
): Extract<ActionCatalogEntry, { kind: K }> {
  const handle = string(value, path);
  const entry = catalog.entries.find((candidate) => candidate.handle === handle);
  if (!entry) reject(path, 'unknown-reference', `Unknown catalog handle "${handle}". Select an exact current handle.`);
  if (entry.saveId !== scope.saveId || entry.branchId !== scope.branchId) {
    reject(path, 'scope-mismatch', 'Reference belongs to a different save or branch.');
  }
  if (entry.state !== 'available') reject(path, 'unavailable-reference', 'Reference is stale or unavailable.');
  if (entry.kind !== kind) reject(path, 'wrong-reference-type', `Expected a ${kind} reference.`);
  return entry as Extract<ActionCatalogEntry, { kind: K }>;
}

function generation(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): ImageGenerationAction {
  fields(value, ['type', 'owner', 'description'], path);
  const owner = reference(value.owner, 'character', catalog, scope, `${path}.owner`);
  if (!owner.capabilities.includes('image.generate')) {
    reject(`${path}.owner`, 'unsupported-capability', 'Image generation is unavailable for this owner.');
  }
  return { type: 'image.generate', ownerId: owner.id, description: string(value.description, `${path}.description`, 16_384) };
}

function messenger(value: Record<string, unknown>, catalog: ActionCatalog, scope: ActionScope, path: string): PreparedAction {
  fields(value, ['type', 'app', 'from', 'to', 'text', 'attachment'], path);
  if (value.app !== 'whatsup') {
    reject(`${path}.app`, 'unsupported-capability', 'Only WhatsUp is supported by this compiler slice. Other apps remain on the legacy path.');
  }
  const from = reference(value.from, 'character', catalog, scope, `${path}.from`);
  const to = reference(value.to, 'character', catalog, scope, `${path}.to`);
  if (from.id === to.id) reject(`${path}.to`, 'invalid-destination', 'Sender and recipient must be different characters.');
  if (!from.capabilities.includes('whatsup.send') || !to.capabilities.includes('whatsup.receive')) {
    reject(path, 'unsupported-capability', 'Sender or recipient does not support this delivery.');
  }
  const action: MessengerSendAction & { generation?: ImageGenerationAction } = {
    type: 'messenger.send', app: 'whatsup', fromId: from.id, toId: to.id,
    text: string(value.text, `${path}.text`, 65_536, value.attachment !== undefined),
  };
  if (value.attachment !== undefined) {
    const pathToAttachment = `${path}.attachment`;
    const attachment = object(value.attachment, pathToAttachment);
    if (attachment.type === 'stored_image') {
      fields(attachment, ['type', 'ref'], pathToAttachment);
      const image = reference(attachment.ref, 'image', catalog, scope, `${pathToAttachment}.ref`);
      if (!image.accessibleTo.includes(from.id)) reject(`${pathToAttachment}.ref`, 'access-denied', 'Sender cannot access this image.');
      action.attachment = { type: 'artifact', artifactId: image.id };
    } else if (attachment.type === 'generate_image') {
      action.generation = generation(attachment, catalog, scope, pathToAttachment);
      if (action.generation.ownerId !== from.id) {
        reject(`${pathToAttachment}.owner`, 'access-denied', 'A generated attachment must belong to the sender in this compiler slice.');
      }
    } else {
      reject(`${pathToAttachment}.type`, 'invalid-shape', 'Expected stored_image or generate_image.');
    }
  }
  return action;
}

// Only registered compiler cases are accepted. Provider schemas and execution
// handlers will extend this boundary; display labels are never action keys.
const actionCompilers = new Map<string, typeof messenger>([
  ['messenger.send', messenger],
  ['image.generate', generation],
]);

function prepareBlock(value: unknown, catalog: ActionCatalog, scope: ActionScope, path: string): PreparedBlock {
  const block = object(value, path);
  if (block.type === 'text') {
    fields(block, ['type', 'text'], path);
    return { type: 'text', text: string(block.text, `${path}.text`, 65_536, true) };
  }
  if (block.type !== 'action') reject(`${path}.type`, 'invalid-shape', 'Expected text or action.');
  fields(block, ['type', 'intent'], path);
  const intent = object(block.intent, `${path}.intent`);
  const key = string(intent.type, `${path}.intent.type`);
  const compile = actionCompilers.get(key);
  if (!compile) reject(`${path}.intent.type`, 'unknown-action', `Unknown action "${key}".`);
  return { type: 'action', action: compile(intent, catalog, scope, `${path}.intent`) };
}

function validateCatalog(catalog: ActionCatalog, scope: ActionScope) {
  for (const key of ['saveId', 'branchId', 'turnId', 'catalogId'] as const) {
    if (!scope[key] || catalog.scope[key] !== scope[key]) {
      reject('catalog', 'scope-mismatch', 'Catalog does not belong to the current save, branch and turn.');
    }
  }
  const handles = new Set<string>();
  for (const entry of catalog.entries) {
    if (handles.has(entry.handle)) reject('catalog', 'ambiguous-reference', `Duplicate handle "${entry.handle}".`);
    handles.add(entry.handle);
    string(entry.id, 'catalog.id');
    string(entry.handle, 'catalog.handle');
  }
}

function materialize(blocks: PreparedBlock[], scope: ActionScope, allocateId: () => string): ActionPlan {
  const plan: ActionPlan = { version: 1, scope: { ...scope }, blocks: [], operations: [] };
  const assigned = new Set<string>();
  const id = () => {
    const next = allocateId();
    if (typeof next !== 'string' || !next.trim() || assigned.has(next)) {
      reject('runtime.id', 'invalid-runtime-id', 'The runtime must allocate non-empty, distinct block and operation IDs.');
    }
    assigned.add(next);
    return next;
  };
  for (const block of blocks) {
    const replyBlockId = id();
    if (block.type === 'text') {
      plan.blocks.push({ type: 'text', id: replyBlockId, text: block.text, provisional: true });
      continue;
    }
    const operationId = id();
    const action = block.action;
    const dependsOn: string[] = [];
    let compiled: ImageGenerationAction | MessengerSendAction;
    if (action.type === 'messenger.send') {
      const { generation: generate, ...delivery } = action;
      compiled = delivery;
      if (generate) {
        const generationId = id();
        plan.operations.push({ id: generationId, scope: { ...scope }, replyBlockId, status: 'validated', dependsOn: [], action: generate });
        dependsOn.push(generationId);
        delivery.attachment = { type: 'operation-result', operationId: generationId };
      }
    } else {
      compiled = action;
    }
    plan.operations.push({ id: operationId, scope: { ...scope }, replyBlockId, status: 'validated', dependsOn, action: compiled });
    plan.blocks.push({ type: 'action', id: replyBlockId, operationId });
  }
  return plan;
}

/** Pure preflight only: accepts a decoded, complete envelope; performs no app or provider effects. */
export function compileActionReply(input: unknown, catalog: ActionCatalog, scope: ActionScope, allocateId: () => string): ActionCompileResult {
  try {
    validateCatalog(catalog, scope);
    const envelope = object(input, 'reply');
    fields(envelope, ['version', 'catalogId', 'blocks'], 'reply');
    if (envelope.version !== 1) reject('version', 'invalid-shape', 'Expected action reply version 1.');
    if (envelope.catalogId !== scope.catalogId) reject('catalogId', 'scope-mismatch', 'Use the current catalog.');
    if (!Array.isArray(envelope.blocks) || envelope.blocks.length > 128) {
      reject('blocks', 'invalid-shape', 'Expected an array of at most 128 reply blocks.');
    }
    const prepared: PreparedBlock[] = [];
    const issues: ActionValidationIssue[] = [];
    for (const [index, block] of envelope.blocks.entries()) {
      try {
        prepared.push(prepareBlock(block, catalog, scope, `blocks[${index}]`));
      } catch (error) {
        if (!(error instanceof InvalidAction)) throw error;
        issues.push(error.issue);
      }
    }
    if (issues.length) return { ok: false, issues };
    return { ok: true, plan: materialize(prepared, scope, allocateId) };
  } catch (error) {
    if (!(error instanceof InvalidAction)) throw error;
    return { ok: false, issues: [error.issue] };
  }
}
