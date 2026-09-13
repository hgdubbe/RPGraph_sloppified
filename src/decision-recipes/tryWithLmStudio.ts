/**
 * Manual, standalone script — NOT part of the app, NOT imported by anything, NOT a test.
 * Runs photoReactionRecipe against a real local LM Studio server so you can see actual
 * latency/output quality per tiny scoped call, instead of the mocked unit tests.
 *
 * Usage (bundled Node runtime must be on PATH first):
 *   npx vite-node src/decision-recipes/tryWithLmStudio.ts
 *
 * Env overrides:
 *   LMSTUDIO_BASE_URL (default http://localhost:1234)
 *   LMSTUDIO_MODEL    (default mistral-small-3.2-24b-instruct-2506-heretic-v1.2-2-i1)
 *
 * Delete this file (and the rest of src/decision-recipes) to remove the whole prototype;
 * nothing else references it.
 */

import { runDecisionRecipe } from './runDecisionRecipe';
import { photoReactionRecipe } from './photoReactionRecipe';

const baseUrl = (process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234').replace(/\/+$/, '');
const model = process.env.LMSTUDIO_MODEL ?? 'mistral-small-3.2-24b-instruct-2506-heretic-v1.2-2-i1';

type LmStudioResponse = { output?: Array<{ type?: string; content?: string }>; stats?: { time_to_first_token_seconds?: number; tokens_per_second?: number } };

async function complete(request: { prompt: string; label: string }) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: request.prompt, stream: false, store: false, temperature: 0.7 }),
  });
  if (!response.ok) {
    throw new Error(`LM Studio request failed (${response.status}): ${await response.text()}`);
  }
  const result = (await response.json()) as LmStudioResponse;
  const text = (result.output ?? [])
    .filter((item) => item?.type === 'message' && typeof item.content === 'string')
    .map((item) => item.content)
    .join('');
  const elapsedMs = Date.now() - startedAt;
  console.log(`\n--- ${request.label} (${elapsedMs}ms) ---`);
  console.log('PROMPT:\n' + request.prompt);
  console.log('RESPONSE:\n' + text);
  if (!text) throw new Error(`LM Studio returned no message text for "${request.label}".`);
  return { text };
}

async function main() {
  const { nodes, context } = photoReactionRecipe({
    situation: 'Alice just finished setting up camp for the night and the sunset over the valley is stunning.',
    personaA: 'Alice is warm, a little dramatic, and loves sharing moments with people she cares about.',
    personaB: 'Bob is dry, teasing, but secretly sentimental.',
    purpose: 'Share the view and make Bob wish he had come along.',
  });

  const startedAt = Date.now();
  const outcomes = await runDecisionRecipe(nodes, context, { complete });
  const elapsedMs = Date.now() - startedAt;

  console.log('\n=== OUTCOMES ===');
  for (const outcome of outcomes) console.log(outcome);
  const callCount = outcomes.filter((o) => o.kind === 'decide' || (o.kind === 'content' && !o.skipped)).length;
  console.log(`\nTotal wall time: ${elapsedMs}ms across ${callCount} LLM calls (${nodes.length - callCount} skipped by gates).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
