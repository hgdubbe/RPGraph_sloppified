import type { NodeLlmApi } from '../llm/NodeLlmApi';

/**
 * The small-call engine behind decision-v1 (see docs/superpowers/plans — "Decision-v1" plan).
 * A `decide` node is a yes/no gate; a `content` node drafts plain text. Each node declares
 * exactly which named context values it needs (`contextKeys`) so its prompt carries nothing
 * else — no other character's persona, no unrelated facts. A `content` node gated by a
 * `decide` node that answered no is skipped without calling the LLM at all. A later node can
 * reference an earlier content node's output by that node's id, since the runner folds every
 * produced output back into the context pool as it goes.
 *
 * Validated against a real local model (LM Studio, mistral-small-24B) in this session's
 * throwaway prototype (src/decision-recipes/) before being promoted here as production code.
 */

export type DecisionContext = Record<string, string>;

export type DecisionNode =
  | { kind: 'decide'; id: string; question: string; contextKeys: string[] }
  // `expectsJson`: only `assistant.chat` needs this — its recipe step output is structured
  // `messages`, not text, so that one node asks for a small JSON array directly instead of
  // prose (decisionAssembler.ts parses/validates it before writing the store record).
  // `validate`: throws with a message describing what was wrong; a failure is retried against
  // the same tiny call with that message appended as feedback (see `maxContentAttempts` below)
  // instead of immediately failing the whole block — cheap here, unlike the old whole-plan
  // retry, since it's one small call being redone, not a giant JSON plan.
  | { kind: 'content'; id: string; instruction: string; contextKeys: string[]; gatedBy?: string; expectsJson?: boolean; validate?: (text: string) => void };

export type DecisionOutcome =
  | { kind: 'decide'; id: string; value: boolean; raw: string }
  | { kind: 'content'; id: string; skipped: true }
  | { kind: 'content'; id: string; skipped: false; text: string };

type DecisionLlm = Pick<NodeLlmApi, 'complete'>;

export type RunDecisionNodesOptions = {
  /** Prefixes each call's `label` (e.g. "Decision workflow / whatsup-message") for run-log readability. */
  labelPrefix: string;
  connectionId?: string;
  signal?: AbortSignal;
  /** Fires once per real LLM call (not per failed retry attempt) with the exact prompt sent
   * and the raw response text — purely for the "Staged Plan Debug" viewer's benefit (S13:
   * previously that debug view showed the compiled plan's shape but never what was actually
   * asked/answered, leaving a dropped-block failure with zero visible trace). Never changes
   * behavior or the returned outcomes. */
  onCall?: (call: { label: string; prompt: string; response: string }) => void;
};

function pickContext(context: DecisionContext, keys: string[]): DecisionContext {
  const scoped: DecisionContext = {};
  for (const key of keys) if (context[key] !== undefined) scoped[key] = context[key];
  return scoped;
}

function renderContext(context: DecisionContext): string[] {
  return Object.entries(context).map(([key, value]) => `${key}: ${value}`);
}

function buildDecidePrompt(question: string, context: DecisionContext): string {
  return ['Answer strictly "yes" or "no" and nothing else.', question, ...renderContext(context)].join('\n');
}

function buildContentPrompt(instruction: string, context: DecisionContext, expectsJson?: boolean, feedback?: string): string {
  const formatLine = expectsJson
    ? 'Return only the JSON array described above — no markdown fence, no surrounding prose.'
    : 'Return plain text only. No JSON, no markdown, no surrounding quotes.';
  return [
    instruction, formatLine,
    ...(feedback ? [`Your previous reply was rejected: ${feedback}. Return a corrected reply that fixes this.`] : []),
    ...renderContext(context),
  ].join('\n');
}

function parseYesNo(text: string): boolean {
  return text.trim().toLowerCase().startsWith('yes');
}

/** Total attempts for one content node before giving up (the first try plus this many
 * corrective retries) — cheap here since it's one small call, unlike the old whole-plan retry. */
export const maxContentAttempts = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'the reply was invalid';
}

/** Runs a decision node list in order against a real LLM, one small scoped call per node. */
export async function runDecisionNodes(
  nodes: DecisionNode[],
  context: DecisionContext,
  llm: DecisionLlm,
  options: RunDecisionNodesOptions,
): Promise<DecisionOutcome[]> {
  const outcomes: DecisionOutcome[] = [];
  const decisions = new Map<string, boolean>();
  const pool: DecisionContext = { ...context };
  for (const node of nodes) {
    if (node.kind === 'content' && node.gatedBy !== undefined && decisions.get(node.gatedBy) === false) {
      outcomes.push({ kind: 'content', id: node.id, skipped: true });
      continue;
    }
    const scoped = pickContext(pool, node.contextKeys);
    if (node.kind === 'decide') {
      const label = `${options.labelPrefix} / ${node.id}`;
      const prompt = buildDecidePrompt(node.question, scoped);
      const result = await llm.complete({
        prompt, label, purpose: 'Decision workflow gate', connectionId: options.connectionId, signal: options.signal,
      });
      options.onCall?.({ label, prompt, response: result.text });
      const value = parseYesNo(result.text);
      decisions.set(node.id, value);
      outcomes.push({ kind: 'decide', id: node.id, value, raw: result.text });
    } else {
      let text = '';
      let lastError: unknown;
      // Only a `validate()` throw is real feedback the model can act on ("your reply was
      // rejected: X, fix it") — found live: a transport/provider failure (e.g. an IPC error,
      // or LM Studio returning an empty message because the model stalled) was being fed back
      // through the exact same "was rejected" framing, handing the model a human-oriented
      // infrastructure error string to "correct" as if it were a critique of its own writing.
      // A call-level failure gets a plain retry of the same prompt instead — nothing to fix,
      // just try again.
      let lastErrorIsValidationFailure = false;
      const label = `${options.labelPrefix} / ${node.id}`;
      for (let attempt = 1; attempt <= maxContentAttempts; attempt++) {
        const feedback = attempt > 1 && lastErrorIsValidationFailure ? errorMessage(lastError) : undefined;
        lastErrorIsValidationFailure = false;
        try {
          const prompt = buildContentPrompt(node.instruction, scoped, node.expectsJson, feedback);
          const result = await llm.complete({
            prompt, label, purpose: 'Decision workflow content',
            connectionId: options.connectionId, signal: options.signal,
          });
          options.onCall?.({ label, prompt, response: result.text });
          text = result.text.trim();
          try {
            node.validate?.(text);
          } catch (validationError) {
            lastErrorIsValidationFailure = true;
            throw validationError;
          }
          lastError = undefined;
          break;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          lastError = error;
        }
      }
      if (lastError) throw lastError;
      pool[node.id] = text;
      outcomes.push({ kind: 'content', id: node.id, skipped: false, text });
    }
  }
  return outcomes;
}
