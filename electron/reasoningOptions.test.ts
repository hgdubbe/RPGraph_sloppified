import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { ollamaReasoningOptions, normalizeReasoningEffort } from '../shared/reasoning.cjs';

const source = readFileSync(new URL('./main.cjs', import.meta.url), 'utf8');
const start = source.indexOf('const supportedReasoningEfforts =');
const end = source.indexOf('function chatCompletionSamplingOptions(', start);
const cached = new Map([['google/test', { mandatory: true, supportedEfforts: ['low', 'high'] }]]);
const options = runInNewContext(`${source.slice(start, end)}; chatCompletionReasoningOptions`, {
  normalizeReasoningEffort,
  ollamaReasoningOptions,
  openRouterReasoningByEndpoint: new Map([['https://openrouter.ai/api/v1/models', cached]]),
  endpoint: (base: string, path: string) => `${base}/${path}`,
}) as (connection: object) => object;

it('checks cached model capabilities even if the caller sends an old setting', () => {
  const connection = { providerKind: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/test' };
  expect(options({ ...connection, reasoningEffort: 'none' })).toEqual({});
  expect(options({ ...connection, reasoningEffort: 'minimal' })).toEqual({});
  expect(options({ ...connection, reasoningEffort: 'low' })).toEqual({ reasoning: { effort: 'low' } });
  expect(options({ ...connection, reasoningEffort: 'auto' })).toEqual({});
});

it('preserves local provider controls and omitted settings', () => {
  expect(options({ providerKind: 'llama-cpp', reasoningEffort: 'none' })).toEqual({
    chat_template_kwargs: { enable_thinking: false }, thinking_budget_tokens: 0,
  });
  expect(options({ providerKind: 'llama-cpp' })).toEqual({});
});

it('sends supported Ollama controls through the OpenAI endpoint', () => {
  const connection = { providerKind: 'ollama', reasoningCapabilities: {
    mandatory: false, supportedEfforts: ['none', 'on'],
  } };
  expect(options({ ...connection, reasoningEffort: 'on' })).toEqual({ reasoning: { effort: 'low' } });
  expect(options({ ...connection, reasoningEffort: 'high' })).toEqual({});
  expect(options({ ...connection, reasoningEffort: 'none' })).toEqual({ reasoning: { effort: 'none' } });
});
