import type { DecisionContext, DecisionLlm, DecisionNode, DecisionOutcome } from './types';

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

function buildContentPrompt(instruction: string, context: DecisionContext): string {
  return [instruction, 'Return plain text only. No JSON, no markdown, no surrounding quotes.', ...renderContext(context)].join('\n');
}

function parseYesNo(text: string): boolean {
  return text.trim().toLowerCase().startsWith('yes');
}

/** Runs a decision recipe's nodes in order against a real LLM, one small scoped call per node.
 * A `content` node whose `gatedBy` decide-node answered no is skipped without calling the LLM. */
export async function runDecisionRecipe(nodes: DecisionNode[], context: DecisionContext, llm: DecisionLlm): Promise<DecisionOutcome[]> {
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
      const result = await llm.complete({ prompt: buildDecidePrompt(node.question, scoped), label: `Decision: ${node.id}`, purpose: 'Decision recipe gate' });
      const value = parseYesNo(result.text);
      decisions.set(node.id, value);
      outcomes.push({ kind: 'decide', id: node.id, value, raw: result.text });
    } else {
      const result = await llm.complete({ prompt: buildContentPrompt(node.instruction, scoped), label: `Content: ${node.id}`, purpose: 'Decision recipe content' });
      const text = result.text.trim();
      pool[node.id] = text;
      outcomes.push({ kind: 'content', id: node.id, skipped: false, text });
    }
  }
  return outcomes;
}
