import { describe, expect, it } from 'vitest';
import { normalizeOllamaReasoning, ollamaReasoningOptions, fastTaskReasoningEffort, reasoningActivation } from '../../shared/reasoning.cjs';
import { connectionWithOllamaReasoning, ollamaCapabilitiesForConnection } from '../app/providerCapabilities';
import type { ConnectionPreset, OllamaModelInfo } from '../types';

describe('Ollama thinking metadata', () => {
  it('maps boolean controls, their default, and OpenAI-compatible requests', () => {
    const profile = normalizeOllamaReasoning({ values: [false, true], default: true });
    expect(profile).toEqual({ mandatory: false, supportedEfforts: ['none', 'on'], defaultEffort: 'on', defaultEnabled: true });
    expect(ollamaReasoningOptions('on', profile)).toEqual({ reasoning: { effort: 'low' } });
    expect(ollamaReasoningOptions('none', profile)).toEqual({ reasoning: { effort: 'none' } });
    expect(ollamaReasoningOptions('high', profile)).toEqual({});
    expect(ollamaReasoningOptions('auto', profile)).toEqual({});
    expect(reasoningActivation('auto', profile)).toBe(true);
    expect(reasoningActivation('none', profile)).toBe(false);
    expect(fastTaskReasoningEffort(profile)).toBe('none');
  });

  it('preserves named efforts and prohibits Off for mandatory thinking', () => {
    const profile = normalizeOllamaReasoning({ values: ['low', 'medium', 'high'], default: 'medium' });
    expect(profile?.mandatory).toBe(true);
    expect(profile?.defaultEffort).toBe('medium');
    expect(ollamaReasoningOptions('high', profile)).toEqual({ reasoning: { effort: 'high' } });
    expect(ollamaReasoningOptions('none', profile)).toEqual({});
    expect(ollamaReasoningOptions('minimal', profile)).toEqual({});
    expect(fastTaskReasoningEffort(profile)).toBe('low');
  });

  it('distinguishes unsupported thinking from absent or unfamiliar metadata', () => {
    const off = normalizeOllamaReasoning({ values: [false], default: false });
    expect(off?.supportedEfforts).toEqual(['none']);
    expect(reasoningActivation('auto', off)).toBe(false);
    expect(normalizeOllamaReasoning(undefined)).toBeUndefined();
    expect(normalizeOllamaReasoning({ values: 'low' })).toBeUndefined();
    expect(normalizeOllamaReasoning({ values: ['custom'], default: 'custom' }))
      .toEqual({ mandatory: true, supportedEfforts: [], defaultEnabled: true });
    expect(fastTaskReasoningEffort(undefined)).toBe('auto');
    // Mixed boolean/named controls cannot represent explicit true on the OpenAI endpoint.
    expect(normalizeOllamaReasoning({ values: [true, false, 'high'], default: true })?.supportedEfforts)
      .toEqual(['none', 'high']);
  });

  it('updates saved settings and clears capabilities on model switches', () => {
    const connection = { model: 'test', providerKind: 'ollama', reasoningEffort: 'high' } as ConnectionPreset;
    const model = { id: 'test', reasoning: normalizeOllamaReasoning({ values: [false, true], default: true }) } as OllamaModelInfo;
    const updated = connectionWithOllamaReasoning(connection, [model]);
    expect(updated.reasoningEffort).toBe('auto');
    expect(ollamaCapabilitiesForConnection(updated, [model]).reasoning).toBe(true);
    expect(connectionWithOllamaReasoning({ ...updated, model: 'other' }, [model]).reasoningCapabilities).toBeUndefined();
    expect(ollamaCapabilitiesForConnection(connection, [{ ...model, reasoning: undefined, thinkingSupported: true }]).reasoning).toBe(true);
    expect(ollamaCapabilitiesForConnection(connection, [{ ...model, reasoning: normalizeOllamaReasoning({ values: [false], default: false }) }]).reasoning).toBe(false);
  });
});
