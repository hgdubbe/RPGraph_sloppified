import { describe, expect, it, vi } from 'vitest';
import { responseContractOptions, assertResponseContractFinished } from './responseContracts.cjs';
import { actionReplyProviderSchema } from '../../src/actions/schema';

describe('provider response contracts', () => {
  it('reports truncated structured replies without changing ordinary chat behavior', () => {
    expect(() => assertResponseContractFinished({ responseContract: 'actions-v1' }, 'length')).toThrow('output token limit');
    expect(() => assertResponseContractFinished({}, 'length')).not.toThrow();
    expect(() => assertResponseContractFinished({ responseContract: 'actions-v1' }, 'stop')).not.toThrow();
  });
  it('uses the current action schema for a resident Unsloth GGUF model', async () => {
    const request = { connection: { providerKind: 'unsloth' }, responseContract: 'actions-v1' };
    const status = vi.fn(async () => ({ is_gguf: true, loaded: ['model'], loading: [] }));
    const result = await responseContractOptions(request, status, undefined);
    expect(result).toEqual({ response_format: { type: 'json_schema', json_schema: { name: 'rpgraph_actions_v1', strict: true, schema: actionReplyProviderSchema } } });
  });
  it('does not probe ordinary calls or infer support from another provider name', async () => {
    const status = vi.fn();
    expect(await responseContractOptions({ connection: { providerKind: 'unsloth' } }, status)).toEqual({});
    expect(await responseContractOptions({ connection: { providerKind: 'lm-studio' }, responseContract: 'actions-v1' }, status)).toEqual({});
    expect(status).not.toHaveBeenCalled();
  });
  it('rechecks backend state for every request instead of caching by provider name', async () => {
    const status = vi.fn().mockResolvedValueOnce({ is_gguf: true, loaded: ['model'], loading: [] })
      .mockResolvedValueOnce({ is_gguf: false, loaded: ['model'], loading: [] });
    const request = { connection: { providerKind: 'unsloth' }, responseContract: 'actions-v1' };
    expect(await responseContractOptions(request, status)).toHaveProperty('response_format');
    expect(await responseContractOptions(request, status)).toEqual({});
    expect(status).toHaveBeenCalledTimes(2);
  });
  it('does not silently downgrade a failed capability check', async () => {
    await expect(responseContractOptions({ connection: { providerKind: 'unsloth' }, responseContract: 'actions-v1' },
      async () => { throw new Error('Unauthorized'); })).rejects.toThrow('Unauthorized');
  });
  it('refuses a model switch in progress rather than silently dropping constraints', async () => {
    await expect(responseContractOptions({ connection: { providerKind: 'unsloth' }, responseContract: 'actions-v1' },
      async () => ({ is_gguf: true, loaded: [], loading: ['new-model'] }))).rejects.toThrow('residency changed');
  });
});
