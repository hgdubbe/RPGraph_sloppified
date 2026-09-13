/**
 * Manual, standalone script — same isolation notes as tryWithLmStudio.ts. Runs the dynamic
 * sequence version (dynamicTurn.ts) against a real local LM Studio server: the model itself
 * decides which block types happen this turn, and in what order, instead of a fixed shape.
 *
 * Usage: npx vite-node src/decision-recipes/tryDynamicTurnWithLmStudio.ts
 * Env: LMSTUDIO_BASE_URL (default http://localhost:1234), LMSTUDIO_MODEL
 */

import { runDynamicTurn, type SceneContext } from './dynamicTurn';

const baseUrl = (process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234').replace(/\/+$/, '');
const model = process.env.LMSTUDIO_MODEL ?? 'mistral-small-3.2-24b-instruct-2506-heretic-v1.2-2-i1';

type LmStudioResponse = { output?: Array<{ type?: string; content?: string }> };

async function complete(request: { prompt: string; label: string }) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: request.prompt, stream: false, store: false, temperature: 0.7 }),
  });
  if (!response.ok) throw new Error(`LM Studio request failed (${response.status}): ${await response.text()}`);
  const result = (await response.json()) as LmStudioResponse;
  const text = (result.output ?? [])
    .filter((item) => item?.type === 'message' && typeof item.content === 'string')
    .map((item) => item.content)
    .join('');
  console.log(`\n--- ${request.label} (${Date.now() - startedAt}ms) ---`);
  console.log('PROMPT:\n' + request.prompt);
  console.log('RESPONSE:\n' + text);
  if (!text) throw new Error(`LM Studio returned no message text for "${request.label}".`);
  return { text };
}

const scene: SceneContext = {
  situation: 'Alice just got home from a long day and found a package on her doorstep — a gift she wasn\'t expecting, from Bob.',
  actorName: 'Alice',
  characters: {
    Alice: { persona: 'Alice is warm, a little dramatic, and loves sharing moments with people she cares about.', appearance: 'Tall, curly auburn hair, freckles, usually in oversized cardigans.' },
    Bob: { persona: 'Bob is dry, teasing, but secretly sentimental.', appearance: 'Short, glasses, always in a hoodie.' },
  },
};

async function main() {
  const startedAt = Date.now();
  const result = await runDynamicTurn(scene, { complete });
  const elapsedMs = Date.now() - startedAt;

  console.log('\n=== CHOSEN SEQUENCE ===');
  console.log(result.sequence);
  console.log('\n=== BLOCK RESULTS ===');
  for (const block of result.blocks) console.log(block.request, '->', block.outcomes);

  const totalCalls = 1 + result.blocks.reduce((sum, b) => sum + b.outcomes.filter((o) => o.kind === 'decide' || (o.kind === 'content' && !o.skipped)).length, 0);
  console.log(`\nTotal wall time: ${elapsedMs}ms across ${totalCalls} LLM calls for ${result.sequence.length} block(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
