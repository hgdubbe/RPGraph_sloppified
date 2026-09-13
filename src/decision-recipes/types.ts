/**
 * Standalone prototype: a "decision recipe" is a small ordered tree of tiny, narrowly-scoped
 * LLM calls instead of one large structured-plan call. Each node declares exactly which named
 * context values it needs (`contextKeys`) — nothing else is put in its prompt. `decide` nodes
 * are yes/no gates; `content` nodes produce plain text and may be skipped (`gatedBy`) if the
 * gate they depend on answered no. A later node can reference an earlier content node's output
 * by that node's `id`, since the runner folds every produced output back into the context pool.
 *
 * Deliberately independent of src/staged-workflow and src/actions — this is a throwaway
 * prototype for one concrete recipe (see photoReactionRecipe.ts), not a new production path.
 * Delete this folder to remove it; nothing outside it depends on these types.
 */

export type DecisionContext = Record<string, string>;

/** Minimal LLM call shape this prototype needs — deliberately not the app's NodeLlmApi, so this
 * folder has zero type-level coupling to the rest of the codebase beyond what's inlined here. */
export type DecisionLlm = { complete(request: { prompt: string; label: string; purpose?: string }): Promise<{ text: string }> };

export type DecisionNode =
  | { kind: 'decide'; id: string; question: string; contextKeys: string[] }
  | { kind: 'content'; id: string; instruction: string; contextKeys: string[]; gatedBy?: string };

export type DecisionOutcome =
  | { kind: 'decide'; id: string; value: boolean; raw: string }
  | { kind: 'content'; id: string; skipped: true }
  | { kind: 'content'; id: string; skipped: false; text: string };
