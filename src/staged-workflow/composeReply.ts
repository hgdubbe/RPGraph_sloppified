import type { CompiledBinding, CompiledTurnPlan } from './compileTurnPlan';
import type { TurnScope, VariableRef } from './contracts';
import type { RunCompiledTurnResult } from './scheduler';
import type { VariableStore } from './variableStore';

export type ComposedItem =
  | { kind: 'text'; beatId: string; speakerId?: string; text: string }
  | { kind: 'receipt'; beatId: string; speakerId?: string; operationId: string; receiptId: string };

export type ComposeReplyResult = {
  /** Ordered exactly as `plan.beats` (arbitrary presentation order, independent of execution order). */
  items: ComposedItem[];
  /** Beats whose content or required receipts are not yet realized/committed. Never partially emitted. */
  incompleteBeatIds: string[];
};

function resolveRef(binding: CompiledBinding, outputs: Record<string, VariableRef>): VariableRef | undefined {
  return binding.source === 'variable' ? binding.ref : outputs[binding.outputId];
}

function composeBeat(
  beat: CompiledTurnPlan['beats'][number],
  run: RunCompiledTurnResult,
  store: VariableStore,
  scope: TurnScope,
): ComposedItem[] | null {
  for (const binding of beat.requiresReceipts) {
    const ref = resolveRef(binding, run.outputs);
    if (!ref || !store.isCommitted(ref)) return null;
  }
  const items: ComposedItem[] = [];
  for (const binding of beat.content) {
    const ref = resolveRef(binding, run.outputs);
    if (!ref) return null;
    const record = store.read(ref, scope, 'system');
    if (record.value.kind === 'text') {
      items.push({ kind: 'text', beatId: beat.id, ...(beat.speakerId ? { speakerId: beat.speakerId } : {}), text: record.value.text });
    } else if (record.value.kind === 'receipt') {
      if (!store.isCommitted(ref)) return null;
      items.push({ kind: 'receipt', beatId: beat.id, ...(beat.speakerId ? { speakerId: beat.speakerId } : {}),
        operationId: record.value.operationId, receiptId: record.value.receiptId });
    } else {
      throw new Error(`Beat ${beat.id} references unsupported ${record.value.kind} content; only text and receipt beats compose today.`);
    }
  }
  return items;
}

/**
 * Deterministically walks a compiled plan's beats in presentation order and resolves
 * each one's realized variable/receipt content. No LLM call, no app-specific rendering:
 * a 'receipt' item only carries `operationId`/`receiptId` (the `message:<id>` convention
 * from `stagedActionAdapter.ts`) — looking the actual delivered message up by id and
 * rendering it (e.g. as an embedded phone message) is the caller's job, exactly mirroring
 * how the existing Structured v1 path in `useGraphRun.ts` already does that lookup.
 * A beat whose content or required receipts are not yet realized/committed is reported
 * as incomplete rather than partially emitted.
 */
export function composeReply(plan: CompiledTurnPlan, run: RunCompiledTurnResult, store: VariableStore): ComposeReplyResult {
  const items: ComposedItem[] = [];
  const incompleteBeatIds: string[] = [];
  for (const beat of plan.beats) {
    const beatItems = composeBeat(beat, run, store, plan.context.scope);
    if (beatItems === null) incompleteBeatIds.push(beat.id);
    else items.push(...beatItems);
  }
  return { items, incompleteBeatIds };
}
