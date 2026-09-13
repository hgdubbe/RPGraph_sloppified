import { describe, expect, it, vi } from 'vitest';
import { maxContentAttempts, runDecisionNodes } from './decisionNodes';
import type { DecisionNode } from './decisionNodes';

function scriptedLlm(responses: string[]) {
  let call = 0;
  return { complete: vi.fn().mockImplementation(async () => ({ text: responses[Math.min(call++, responses.length - 1)] })) };
}

describe('runDecisionNodes — retry with feedback', () => {
  it('retries a content node whose validate() rejects the reply, with the error fed back, and succeeds once valid', async () => {
    const nodes: DecisionNode[] = [
      { kind: 'content', id: 'a', instruction: 'Say a number.', contextKeys: [], validate: (text) => {
        if (text !== '42') throw new Error('Expected the number 42.');
      } },
    ];
    const llm = scriptedLlm(['seven', 'forty-two', '42']);
    const outcomes = await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' });
    expect(outcomes).toEqual([{ kind: 'content', id: 'a', skipped: false, text: '42' }]);
    expect(llm.complete).toHaveBeenCalledTimes(3);
    const secondPrompt = llm.complete.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain('Expected the number 42.');
    expect(secondPrompt).toContain('was rejected');
  });

  it('gives up after maxContentAttempts and throws the last validation error', async () => {
    const nodes: DecisionNode[] = [
      { kind: 'content', id: 'a', instruction: 'Say a number.', contextKeys: [], validate: () => { throw new Error('Never valid.'); } },
    ];
    const llm = scriptedLlm(['x', 'y', 'z', 'w']);
    await expect(runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' })).rejects.toThrow('Never valid.');
    expect(llm.complete).toHaveBeenCalledTimes(maxContentAttempts);
  });

  it('retries when the LLM call itself throws (e.g. an empty-reply error from the provider), not just on validate() failures', async () => {
    let call = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) throw new Error('LM Studio returned a response without message text.');
        return { text: 'recovered' };
      }),
    };
    const nodes: DecisionNode[] = [{ kind: 'content', id: 'a', instruction: 'Say hi.', contextKeys: [] }];
    const outcomes = await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' });
    expect(outcomes).toEqual([{ kind: 'content', id: 'a', skipped: false, text: 'recovered' }]);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('a call-level failure (transport/provider error, not a validate() rejection) is retried with the same prompt — no "was rejected" feedback text', async () => {
    let call = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1) throw new Error("Error invoking remote method 'llm:chat-completion': LM Studio returned a response without message text.");
        return { text: 'recovered' };
      }),
    };
    const nodes: DecisionNode[] = [{ kind: 'content', id: 'a', instruction: 'Say hi.', contextKeys: [] }];
    await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' });
    const secondPrompt = llm.complete.mock.calls[1][0].prompt as string;
    expect(secondPrompt).not.toContain('was rejected');
    expect(secondPrompt).not.toContain('llm:chat-completion');
    expect(secondPrompt).toBe('Say hi.\nReturn plain text only. No JSON, no markdown, no surrounding quotes.');
  });

  it('a validate() rejection followed by a call-level failure does not leak the stale validation feedback into the next retry', async () => {
    let call = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async () => {
        call++;
        if (call === 2) throw new Error('transport hiccup');
        return { text: call === 1 ? 'wrong' : '42' };
      }),
    };
    const nodes: DecisionNode[] = [
      { kind: 'content', id: 'a', instruction: 'Say 42.', contextKeys: [], validate: (text) => {
        if (text !== '42') throw new Error('Expected 42.');
      } },
    ];
    const outcomes = await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' });
    expect(outcomes).toEqual([{ kind: 'content', id: 'a', skipped: false, text: '42' }]);
    // attempt 1: no feedback (first try). attempt 2 (after validate() rejected 'wrong'): feedback
    // present. attempt 3 (after the transport error on attempt 2, not a validate() rejection):
    // feedback must be gone again, not still describing the now-stale validation complaint.
    expect(llm.complete.mock.calls[0][0].prompt).not.toContain('was rejected');
    expect(llm.complete.mock.calls[1][0].prompt).toContain('Expected 42.');
    expect(llm.complete.mock.calls[2][0].prompt).not.toContain('was rejected');
  });

  it('a node with no validate() never retries, even on a suspicious-looking reply', async () => {
    const llm = scriptedLlm(['anything at all']);
    const nodes: DecisionNode[] = [{ kind: 'content', id: 'a', instruction: 'Say hi.', contextKeys: [] }];
    const outcomes = await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' });
    expect(outcomes).toEqual([{ kind: 'content', id: 'a', skipped: false, text: 'anything at all' }]);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('does not retry an aborted call — the AbortError propagates immediately', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    const llm = { complete: vi.fn().mockRejectedValue(abortError) };
    const nodes: DecisionNode[] = [{ kind: 'content', id: 'a', instruction: 'Say hi.', contextKeys: [] }];
    await expect(runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test' })).rejects.toThrow('aborted');
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('onCall fires once per real call (not per failed retry attempt) with the exact prompt and response (S13 debug capture)', async () => {
    const llm = scriptedLlm(['not 42', '42']);
    const nodes: DecisionNode[] = [
      { kind: 'content', id: 'a', instruction: 'Say 42.', contextKeys: [], validate: (text) => {
        if (text !== '42') throw new Error('Expected 42.');
      } },
    ];
    const calls: Array<{ label: string; prompt: string; response: string }> = [];
    await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test', onCall: (call) => calls.push(call) });
    expect(calls).toHaveLength(2);
    expect(calls[0].label).toBe('Test / a');
    expect(calls[0].response).toBe('not 42');
    expect(calls[1].response).toBe('42');
    expect(calls[1].prompt).toContain('was rejected');
  });

  it('onCall does not fire for a node skipped by a failed gate (no LLM call happened)', async () => {
    const llm = scriptedLlm(['no']);
    const nodes: DecisionNode[] = [
      { kind: 'decide', id: 'gate', question: 'Proceed?', contextKeys: [] },
      { kind: 'content', id: 'a', instruction: 'Say hi.', contextKeys: [], gatedBy: 'gate' },
    ];
    const calls: Array<{ label: string; prompt: string; response: string }> = [];
    const outcomes = await runDecisionNodes(nodes, {}, llm, { labelPrefix: 'Test', onCall: (call) => calls.push(call) });
    expect(outcomes).toEqual([{ kind: 'decide', id: 'gate', value: false, raw: 'no' }, { kind: 'content', id: 'a', skipped: true }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].label).toBe('Test / gate');
  });
});
