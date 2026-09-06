import { describe, expect, it } from 'vitest';

const validation = await import('./ipc/validation.cjs');

describe('IPC validation', () => {
  it('rejects missing chat prompt and connection', () => {
    expect(() => validation.assertChatCompletionRequest(null)).toThrow('chat completion');
    expect(() => validation.assertChatCompletionRequest({ prompt: 'hi' })).toThrow('connection');
    expect(() => validation.assertChatCompletionRequest({ connection: {}, prompt: 123 })).toThrow('prompt');
  });

  it('accepts a minimal chat request', () => {
    const request = {
      connection: { id: 'local', provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: 'model' },
      prompt: 'Hello',
    };
    expect(validation.assertChatCompletionRequest(request)).toBe(request);
  });

  it('accepts optional chat image arrays and max token numbers without requiring them', () => {
    const request = {
      connection: { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'model' },
      prompt: 'Describe this',
      images: [],
      maxTokens: 400,
    };
    expect(validation.assertChatCompletionRequest(request)).toBe(request);
  });

  it('rejects settings payloads without the RPGraph settings marker', () => {
    expect(() => validation.assertSettingsPayload({})).toThrow('settings');
    expect(() => validation.assertSettingsPayload({ format: 'rpgraph-settings', version: 1 })).not.toThrow();
  });
});
