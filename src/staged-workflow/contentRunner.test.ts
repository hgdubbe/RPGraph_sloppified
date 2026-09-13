import { describe, expect, it, vi } from 'vitest';
import { createStagedContentAdapter, stagedContentPrompt } from './contentRunner';
import type { StageExecutionInput } from './scheduler';
import type { NodeLlmApi } from '../llm/NodeLlmApi';
import type { NodeLlmResult } from '../llm/types';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };

function input(): StageExecutionInput {
  return {
    stage: {
      id: 'stage-1',
      instanceId: 'instance-1',
      recipeId: 'whatsup.message',
      key: 'draft',
      kind: 'generate-content',
      actorId: 'alice',
      visibility: { kind: 'characters', characterIds: ['alice'] },
      lockedArguments: { recipientId: 'bob' },
      retryPolicy: 'reconcile-before-retry',
      inputs: [],
      output: { id: 'stage-1/output', kind: 'text' },
      dependencies: [],
    },
    inputs: [{
      ref: { id: 'GH', revision: 1, kind: 'facts', scope },
      scope,
      value: { kind: 'facts', facts: [{ sourceId: 'message:1', text: 'Bob asked Alice to text him.' }] },
      producer: { kind: 'context', sourceId: 'GH' },
      inputs: [],
      provenance: 'observed',
      visibility: { kind: 'characters', characterIds: ['alice'] },
      retention: 'turn',
    }],
    instruction: {
      ref: { id: 'I', revision: 1, kind: 'text', scope },
      scope,
      value: { kind: 'text', text: 'Write warmly.' },
      producer: { kind: 'context', sourceId: 'I' },
      inputs: [],
      provenance: 'observed',
      visibility: { kind: 'characters', characterIds: ['alice'] },
      retention: 'turn',
    },
  };
}

describe('staged content runner', () => {
  it('builds a selected-input prompt with instruction and provenance', () => {
    const prompt = stagedContentPrompt(input());
    expect(prompt).toContain('Stage: whatsup.message/draft');
    expect(prompt).toContain('"recipientId": "bob"');
    expect(prompt).toContain('Instructions:\nWrite warmly.');
    expect(prompt).toContain('Input 1: GH@1 (facts, observed)');
    expect(prompt).toContain('Bob asked Alice to text him.');
    expect(prompt).toContain('Do not change locked actors');
  });

  it('asks for a JSON messages array when the stage output kind is messages', () => {
    const messagesInput = input();
    messagesInput.stage = { ...messagesInput.stage, recipeId: 'assistant.chat', key: 'messages', output: { id: 'stage-1/output', kind: 'messages' } };
    const prompt = stagedContentPrompt(messagesInput);
    expect(prompt).toContain('Stage: assistant.chat/messages');
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('strictly alternating and starting with "user"');
    expect(prompt).not.toContain('Return only the requested draft text.');
  });

  it('calls NodeLlmApi with staged metadata and strips leading reasoning blocks', async () => {
    const result: NodeLlmResult = {
      text: '<think>drafting</think>Hey Bob',
      stats: { inputTokens: 1, outputTokens: 2, totalTokens: 3, durationMs: 4 },
      connection: {
        id: 'c1',
        kind: 'llm',
        label: 'Test LLM',
        providerKind: 'lm-studio',
        baseUrl: 'http://127.0.0.1:1234',
        apiKey: '',
        model: 'test-model',
      },
    };
    const complete = vi.fn<Pick<NodeLlmApi, 'complete'>['complete']>(async () => result);
    const abort = new AbortController();
    const run = createStagedContentAdapter({ complete }, {
      connectionId: 'c1',
      maxTokens: 120,
      temperature: 0.4,
      useConnectionSampling: true,
    });
    await expect(run({ ...input(), signal: abort.signal })).resolves.toBe('Hey Bob');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: 'c1',
      label: 'Staged content: whatsup.message/draft',
      nodeId: 'stage-1',
      purpose: 'Staged workflow content generation',
      maxTokens: 120,
      temperature: 0.4,
      useConnectionSampling: true,
      signal: abort.signal,
      stage: { kind: 'step', name: 'Staged whatsup.message/draft' },
    }));
  });
});
