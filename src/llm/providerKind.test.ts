import { describe, expect, it } from 'vitest';
import {
  inferredProviderKind,
  shouldBackgroundPollProviderConnection,
  validLlmProviderKind,
} from './providerKind';
import type { ConnectionPreset } from '../types';

function llmConnection(patch: Partial<ConnectionPreset>): ConnectionPreset {
  return {
    id: 'provider',
    kind: 'llm',
    providerKind: 'lm-studio',
    label: 'Provider',
    baseUrl: 'http://localhost:1234/v1',
    apiKey: '',
    model: '',
    ...patch,
  };
}

describe('provider kind detection', () => {
  it('accepts and infers Venice providers', () => {
    expect(validLlmProviderKind('venice')).toBe('venice');
    expect(inferredProviderKind(llmConnection({
      label: 'Venice AI',
      baseUrl: 'https://api.venice.ai/api/v1',
    }))).toBe('venice');
  });

  it('accepts and infers Composite providers', () => {
    expect(validLlmProviderKind('composite')).toBe('composite');
    expect(inferredProviderKind(llmConnection({
      label: 'Composite',
      baseUrl: 'https://composite.lucidity.sh/v1',
    }))).toBe('composite');
  });

  it('background-polls only local model manager providers', () => {
    expect(shouldBackgroundPollProviderConnection(llmConnection({
      providerKind: 'lm-studio',
      baseUrl: 'http://localhost:1234/v1',
    }))).toBe(true);

    expect(shouldBackgroundPollProviderConnection(llmConnection({
      providerKind: 'openrouter',
      label: 'Local OpenAI Gateway',
      baseUrl: 'http://localhost:8080/v1',
    }))).toBe(false);

    expect(shouldBackgroundPollProviderConnection(llmConnection({
      providerKind: 'venice',
      label: 'Venice AI',
      baseUrl: 'https://api.venice.ai/api/v1',
    }))).toBe(false);

    expect(shouldBackgroundPollProviderConnection(llmConnection({
      providerKind: 'composite',
      label: 'Composite',
      baseUrl: 'https://composite.lucidity.sh/v1',
    }))).toBe(false);
  });
});
