import { compileActionReply } from './compileReply';
import type { ActionCatalog, ActionPlan, ActionScope, ActionValidationIssue, ValidatedOperation } from './contracts';
import { actionExecutionDefinition, assertCatalogScope, assertOperationAvailable, type ActionAdapters, type ActionResult } from './executionRegistry';

type OperationOutcome = {
  id: string;
  status: 'committed' | 'failed' | 'cancelled' | 'blocked' | 'outcome-unknown';
  result?: ActionResult;
  error?: string;
};

export type ExecutionReport = { scope: ActionScope; blocks: ActionPlan['blocks']; operations: OperationOutcome[]; error?: string };
/**
 * Durable H7 effect journal. Optional so existing callers/tests are unaffected; the live
 * bridge wires a real disk-backed implementation. `recordAttempt` is awaited immediately
 * before the real effect runs — a rejected attempt write blocks the effect (fail closed) —
 * and `recordOutcome` immediately after, per operation, since one plan can hold several.
 */
export type JournalAdapter = {
  recordAttempt: (input: { operationId: string; scope: ActionScope; actionType: string }) => Promise<void>;
  recordOutcome: (input: { operationId: string; status: 'committed' | 'failed'; result?: ActionResult; error?: string }) => Promise<void>;
};
type ExecutionOptions = {
  scope: ActionScope;
  getCatalog: () => ActionCatalog;
  allocateId: () => string;
  adapters: ActionAdapters;
  journal?: JournalAdapter;
  signal?: AbortSignal;
};

export type PreparedExecution =
  | { ok: false; issues: ActionValidationIssue[] }
  | { ok: true; execution: { plan: ActionPlan; run: () => Promise<ExecutionReport> } };

function attachmentFor(operation: ValidatedOperation, outcomes: OperationOutcome[]): string | undefined {
  if (operation.action.type !== 'messenger.send' || !operation.action.attachment) return undefined;
  const binding = operation.action.attachment;
  if (binding.type === 'artifact') return binding.artifactId;
  const source = outcomes.find((outcome) => outcome.id === binding.operationId);
  if (source?.status !== 'committed' || source.result?.type !== 'image.generated') throw new Error('Required generation result is not committed.');
  return source.result.artifactId;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Action failed with an unrecognized error.';
}

/** In-memory execution boundary. Adapters are supplied by the caller; restart recovery is not implemented. */
export function prepareActionExecution(input: unknown, options: ExecutionOptions): PreparedExecution {
  const scope = { ...options.scope };
  const draft = structuredClone(input);
  const getCatalog = options.getCatalog;
  const adapters = { ...options.adapters };
  const journal = options.journal;
  const signal = options.signal;
  const compiled = compileActionReply(draft, getCatalog(), scope, options.allocateId);
  if (!compiled.ok) return compiled;
  const plan = compiled.plan;
  let running: Promise<ExecutionReport> | undefined;

  async function execute(): Promise<ExecutionReport> {
    const outcomes: OperationOutcome[] = [];
    let stopped = false;
    let initialError: string | undefined;
    // Preflight accepted stable IDs, not model handles that may have been reassigned.
    // Future generated assets are checked after generation, before delivery.
    try {
      const currentCatalog = getCatalog();
      assertCatalogScope(currentCatalog, scope);
      for (const operation of plan.operations) {
        const binding = operation.action.type === 'messenger.send' ? operation.action.attachment : undefined;
        assertOperationAvailable(operation, currentCatalog, binding?.type === 'artifact' ? binding.artifactId : undefined, true);
      }
    } catch (error) {
      initialError = errorText(error);
    }
    for (const operation of plan.operations) {
      if (signal?.aborted) {
        outcomes.push({ id: operation.id, status: 'cancelled' });
        continue;
      }
      if (stopped) {
        outcomes.push({ id: operation.id, status: 'blocked' });
        continue;
      }
      let invoked = false;
      try {
        if (initialError) throw new Error(initialError);
        if (operation.dependsOn.some((id) => !outcomes.some((outcome) => outcome.id === id && outcome.status === 'committed'))) {
          throw new Error('A required operation did not commit.');
        }
        const artifactId = attachmentFor(operation, outcomes);
        assertOperationAvailable(operation, getCatalog(), artifactId);
        const definition = actionExecutionDefinition(operation.action.type);
        // Durable record before the real effect runs, so a crash afterward cannot
        // silently lose all evidence of it. A rejected write blocks the effect.
        await journal?.recordAttempt({ operationId: operation.id, scope: { ...operation.scope }, actionType: operation.action.type });
        invoked = true;
        const result = await definition.execute(operation, { adapters, signal, artifactId, getCatalog });
        await journal?.recordOutcome({ operationId: operation.id, status: 'committed', result });
        outcomes.push({ id: operation.id, status: 'committed', result });
      } catch (error) {
        // An adapter may have performed its effect before losing acknowledgement.
        // Never infer a safe retry from a thrown error or malformed receipt.
        if (invoked) {
          // Best-effort: the real effect may already have happened; still try to
          // record the failure durably, but a second failure here must not mask
          // the original error reported to the caller.
          await journal?.recordOutcome({ operationId: operation.id, status: 'failed', error: errorText(error) }).catch(() => {});
        }
        outcomes.push({ id: operation.id, status: invoked ? 'outcome-unknown' : 'failed', error: errorText(error) });
        stopped = true;
      }
    }
    return { scope: { ...scope }, blocks: structuredClone(plan.blocks), operations: outcomes,
      ...(initialError ? { error: initialError } : {}),
    };
  }

  return { ok: true, execution: {
    plan: structuredClone(plan),
    run() {
      running ??= Promise.resolve().then(execute);
      return running.then((report) => structuredClone(report));
    },
  } };
}
