import { describe, expect, it } from 'vitest';
import { normalizeLmStudioReasoning, reasoningActivation, normalizeReasoningCapabilities, supportsReasoningEffort, normalizeReasoningEffort, fastTaskReasoningEffort } from '../../shared/reasoning.cjs';
import { connectionWithOpenRouterCapabilities } from '../app/providerCapabilities';
import type { ConnectionPreset, OpenRouterModelInfo } from '../types';

const mandatory = normalizeReasoningCapabilities({
  mandatory: true, default_enabled: true,
  supported_efforts: ['high', 'medium', 'low'], default_effort: 'medium',
})!;

describe('OpenRouter reasoning capabilities', () => {
  it('preserves mandatory reasoning, the default and supported levels', () => {
    expect(mandatory).toEqual({ mandatory: true, defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low'], defaultEffort: 'medium' });
    expect(supportsReasoningEffort('none', mandatory)).toBe(false);
    expect(supportsReasoningEffort('minimal', mandatory)).toBe(false);
    expect(supportsReasoningEffort('low', mandatory)).toBe(true);
    expect(supportsReasoningEffort('auto', mandatory)).toBe(true);
    expect(normalizeReasoningEffort('none', mandatory)).toBe('auto');
    expect(fastTaskReasoningEffort(mandatory)).toBe('low');
  });

  it('distinguishes unrestricted, absent and unknown effort metadata', () => {
    expect(supportsReasoningEffort('max', { supportedEfforts: null })).toBe(true);
    expect(supportsReasoningEffort('low', { mandatory: false })).toBe(false);
    expect(supportsReasoningEffort('none', { mandatory: false })).toBe(true);
    expect(supportsReasoningEffort('low', undefined)).toBe(true);
    expect(fastTaskReasoningEffort(undefined)).toBe('auto');
    expect(fastTaskReasoningEffort({ mandatory: true })).toBe('auto');
    expect(supportsReasoningEffort('none', { mandatory: true, supportedEfforts: null })).toBe(false);
  });

  it('ignores malformed metadata and unrecognized effort names', () => {
    expect(normalizeReasoningCapabilities(null)).toBeUndefined();
    expect(normalizeReasoningCapabilities([])).toBeUndefined();
    expect(normalizeReasoningCapabilities({ supported_efforts: ['low', 'invalid', 5] }))
      .toEqual({ supportedEfforts: ['low'] });
  });

  it('resolves saved efforts against the newly selected model and clears stale metadata', () => {
    const connection = { providerKind: 'openrouter', model: 'google/test',
      reasoningEffort: 'none', baseUrl: 'https://openrouter.ai/api/v1' } as ConnectionPreset;
    const model = { id: 'google/test', reasoning: mandatory } as OpenRouterModelInfo;
    const updated = connectionWithOpenRouterCapabilities(connection, [model]);
    expect(updated.reasoningEffort).toBe('auto');
    expect(updated.reasoningCapabilities).toEqual(mandatory);
    expect(connectionWithOpenRouterCapabilities({ ...updated, model: 'unknown' }, [model])
      .reasoningCapabilities).toBeUndefined();
  });
});

describe('LM Studio reasoning capabilities', () => {
  it('offers only the reported switch and resolves the default activation', () => {
    const capabilities = normalizeLmStudioReasoning({ allowed_options: ['off', 'on'], default: 'on' });
    expect(capabilities).toEqual({ mandatory: false, supportedEfforts: ['none', 'on'],
      defaultEffort: 'on', defaultEnabled: true });
    expect(supportsReasoningEffort('on', capabilities)).toBe(true);
    expect(supportsReasoningEffort('low', capabilities)).toBe(false);
    expect(normalizeReasoningEffort('high', capabilities)).toBe('auto');
    expect(reasoningActivation('auto', capabilities)).toBe(true);
    expect(reasoningActivation('none', capabilities)).toBe(false);
    expect(reasoningActivation('on', capabilities)).toBe(true);
    expect(fastTaskReasoningEffort(capabilities)).toBe('none');
  });

  it('handles mandatory switches and models with real effort levels', () => {
    const alwaysOn = normalizeLmStudioReasoning({ allowed_options: ['on'], default: 'on' });
    expect(supportsReasoningEffort('none', alwaysOn)).toBe(false);
    expect(fastTaskReasoningEffort(alwaysOn)).toBe('on');
    const levels = normalizeLmStudioReasoning({ allowed_options: ['low', 'medium', 'high'], default: 'medium' });
    expect(fastTaskReasoningEffort(levels)).toBe('low');
    expect(supportsReasoningEffort('on', levels)).toBe(false);
    expect(supportsReasoningEffort('minimal', levels)).toBe(false);
    expect(normalizeLmStudioReasoning(undefined)).toBeUndefined();
    expect(reasoningActivation('auto', undefined)).toBeUndefined();
    expect(reasoningActivation('auto', normalizeLmStudioReasoning({ allowed_options: ['off', 'on'], default: 'off' }))).toBe(false);
  });
});
