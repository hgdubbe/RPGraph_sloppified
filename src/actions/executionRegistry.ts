import type {
  ActionCatalog, ActionCatalogEntry, ActionScope, CanonicalAction, ValidatedOperation,
} from './contracts';

type AdapterContext = { operationId: string; scope: ActionScope; signal?: AbortSignal };
export type ImageGenerationRequest = AdapterContext & { ownerId: string; description: string };
export type MessageDeliveryRequest = AdapterContext & {
  app: 'whatsup'; fromId: string; toId: string; text: string; artifactId?: string;
};

// Adapters must persist the asset/message before acknowledging it. The current
// runner provides no durable journal; adapter implementations must not imply one.
export type ActionAdapters = {
  generateImage: (request: ImageGenerationRequest) => Promise<unknown>;
  sendMessage: (request: MessageDeliveryRequest) => Promise<unknown>;
};

export type ActionResult =
  | { type: 'image.generated'; artifactId: string; ownerId: string }
  | { type: 'messenger.sent'; messageId: number; fromId: string; toId: string; text: string; artifactId?: string };

type ExecutionContext = {
  adapters: ActionAdapters;
  signal?: AbortSignal;
  artifactId?: string;
  getCatalog: () => ActionCatalog;
};

type ExecutionDefinition = {
  key: CanonicalAction['type'];
  retryPolicy: 'reconcile-before-retry';
  execute: (operation: ValidatedOperation, context: ExecutionContext) => Promise<ActionResult>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Adapter returned an invalid result object.');
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new Error('Adapter returned unexpected result fields.');
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Adapter returned an invalid artifact ID.');
  return value;
}

export function assertCatalogScope(catalog: ActionCatalog, scope: ActionScope) {
  for (const key of ['saveId', 'branchId', 'turnId', 'catalogId'] as const) {
    if (catalog.scope[key] !== scope[key]) throw new Error('Action scope changed before execution.');
  }
}

function currentReference<K extends ActionCatalogEntry['kind']>(catalog: ActionCatalog, scope: ActionScope, id: string, kind: K): Extract<ActionCatalogEntry, { kind: K }> {
  const matches = catalog.entries.filter((entry) => entry.id === id && entry.kind === kind);
  if (matches.length !== 1) throw new Error(`Missing or ambiguous ${kind} reference: ${id}.`);
  const entry = matches[0];
  if (entry.saveId !== scope.saveId || entry.branchId !== scope.branchId || entry.state !== 'available') {
    throw new Error(`Unavailable or cross-scope reference: ${id}.`);
  }
  return entry as Extract<ActionCatalogEntry, { kind: K }>;
}

function assertImageAccess(catalog: ActionCatalog, scope: ActionScope, artifactId: string, characterId: string) {
  const image = currentReference(catalog, scope, artifactId, 'image');
  if (!image.accessibleTo.includes(characterId)) throw new Error('The acting character cannot access the image.');
}

export function assertOperationAvailable(operation: ValidatedOperation, catalog: ActionCatalog, artifactId?: string, allowPendingGeneration = false) {
  assertCatalogScope(catalog, operation.scope);
  const action = operation.action;
  if (action.type === 'image.generate') {
    const owner = currentReference(catalog, operation.scope, action.ownerId, 'character');
    if (!owner.capabilities.includes('image.generate')) throw new Error('Image generation is no longer available.');
    return;
  }
  const from = currentReference(catalog, operation.scope, action.fromId, 'character');
  const to = currentReference(catalog, operation.scope, action.toId, 'character');
  if (from.id === to.id || !from.capabilities.includes('whatsup.send') || !to.capabilities.includes('whatsup.receive')) {
    throw new Error('The requested WhatsUp delivery is no longer available.');
  }
  if (action.attachment && !artifactId && !(allowPendingGeneration && action.attachment.type === 'operation-result')) {
    throw new Error('Delivery is missing its required image artifact.');
  }
  if (artifactId) assertImageAccess(catalog, operation.scope, artifactId, from.id);
}

const generation: ExecutionDefinition = {
  key: 'image.generate',
  retryPolicy: 'reconcile-before-retry',
  async execute(operation, context) {
    if (operation.action.type !== 'image.generate') throw new Error('Wrong action passed to image handler.');
    const { ownerId, description } = operation.action;
    const result = record(await context.adapters.generateImage({
      operationId: operation.id, scope: { ...operation.scope }, ownerId, description, signal: context.signal,
    }));
    exactFields(result, ['artifactId', 'ownerId']);
    const artifactId = identifier(result.artifactId);
    if (result.ownerId !== ownerId) throw new Error('Generated artifact owner does not match the requested owner.');
    const catalog = context.getCatalog();
    assertCatalogScope(catalog, operation.scope);
    assertImageAccess(catalog, operation.scope, artifactId, ownerId);
    return { type: 'image.generated', artifactId, ownerId };
  },
};

const messenger: ExecutionDefinition = {
  key: 'messenger.send',
  retryPolicy: 'reconcile-before-retry',
  async execute(operation, context) {
    if (operation.action.type !== 'messenger.send') throw new Error('Wrong action passed to messenger handler.');
    const { app, fromId, toId, text } = operation.action;
    const result = record(await context.adapters.sendMessage({
      operationId: operation.id, scope: { ...operation.scope }, app, fromId, toId, text,
      ...(context.artifactId ? { artifactId: context.artifactId } : {}), signal: context.signal,
    }));
    exactFields(result, ['messageId', 'fromId', 'toId', 'text', 'artifactId']);
    if (typeof result.messageId !== 'number' || !Number.isSafeInteger(result.messageId) || result.messageId < 0
      || result.fromId !== fromId || result.toId !== toId || result.text !== text || result.artifactId !== context.artifactId) {
      throw new Error('Delivery acknowledgement does not match the requested message.');
    }
    return { type: 'messenger.sent', messageId: result.messageId, fromId, toId, text,
      ...(context.artifactId ? { artifactId: context.artifactId } : {}),
    };
  },
};

const registry = new Map<CanonicalAction['type'], ExecutionDefinition>([
  [generation.key, generation], [messenger.key, messenger],
]);

export function actionExecutionDefinition(type: CanonicalAction['type']): ExecutionDefinition {
  const definition = registry.get(type);
  if (!definition) throw new Error(`No execution handler is registered for ${type}.`);
  return definition;
}
