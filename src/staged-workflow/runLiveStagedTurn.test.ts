import { describe, expect, it, vi } from 'vitest';
import type { WorkflowNode } from '../types';
import { starterRpStorybook, rpStorybookJsonText } from '../nodes/rp-storybook/model';
import { storyCharactersFromNodes } from '../storybook/runtime';
import { maxCompileAttempts, runLiveStagedTurn } from './runLiveStagedTurn';
import type { StagedActionBridge } from './stagedActionAdapter';

function storyCharacterIds(nodes: WorkflowNode[]): string[] {
  return storyCharactersFromNodes(nodes).map((character) => character.id);
}

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };

function storyNodes(): WorkflowNode[] {
  const story = structuredClone(starterRpStorybook);
  story.characters = ['Alice', 'Bob'].map((name) => ({
    ...structuredClone(story.characters[0]), id: name.toLowerCase(), name,
    banking: { startBalance: 100, fixedExpenses: [] },
    comfyConfig: { appearance: `${name} appearance`, loraName: '' }, images: [],
  }));
  return [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
}

function fakeLlm(text: string) {
  return { complete: vi.fn().mockResolvedValue({ text }) };
}

function planLlm(buildPlan: (payload: { catalogRevision: string; characterIds: string[]; context: { OC: unknown; instructions: Record<string, unknown> } }) => unknown, contentText = 'Hey Bob, just checking in.') {
  return {
    complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
      if (request.label === 'Staged workflow plan') {
        const payload = JSON.parse(request.prompt.split('\n').pop()!);
        return { text: JSON.stringify(buildPlan(payload)) };
      }
      return { text: contentText };
    }),
  };
}

function whatsupPlan(payload: { catalogRevision: string; characterIds: string[]; context: { OC: unknown; instructions: Record<string, unknown> } }) {
  const [alice, bob] = payload.characterIds;
  return {
    version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations: 0,
    instances: [{
      id: 'm1', recipe: 'whatsup.message', purpose: 'Say hi to Bob.', actorId: alice,
      visibility: { kind: 'characters', characterIds: [alice] }, args: { recipientId: bob },
      inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
      dependencies: [],
    }],
    beats: [{
      id: 'b1', visibility: { kind: 'characters', characterIds: [alice] },
      content: [{ source: 'output', instanceId: 'm1', output: 'receipt', kind: 'receipt' }],
      requiresReceipts: [{ source: 'output', instanceId: 'm1', output: 'receipt', kind: 'receipt' }],
    }],
  };
}

function narrationPlan(payload: { catalogRevision: string; characterIds: string[]; context: { OC: unknown; instructions: Record<string, unknown> } }, continuations: number) {
  const [alice] = payload.characterIds;
  return {
    version: 'staged-v1', catalogRevision: payload.catalogRevision, continuations,
    instances: [{
      id: 'n1', recipe: 'narration.speech', purpose: 'Narrate the scene.', actorId: alice,
      visibility: { kind: 'characters', characterIds: [alice] }, args: {},
      inputs: { context: { source: 'variable', ref: payload.context.OC }, instructions: { source: 'variable', ref: payload.context.instructions.general } },
      dependencies: [],
    }],
    beats: [{
      id: 'b1', visibility: { kind: 'characters', characterIds: [alice] },
      content: [{ source: 'output', instanceId: 'n1', output: 'speech', kind: 'text' }],
      requiresReceipts: [],
    }],
  };
}

describe('runLiveStagedTurn — continuation planning', () => {
  it('runs a continuation round when the model declares continuations > 0, accumulating both rounds\' items into one result', async () => {
    let planCalls = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
        if (request.label === 'Staged workflow plan') {
          planCalls++;
          const payload = JSON.parse(request.prompt.split('\n').pop()!);
          return { text: JSON.stringify(narrationPlan(payload, planCalls === 1 ? 1 : 0)) };
        }
        return { text: planCalls === 1 ? 'Round one narration.' : 'Round two narration.' };
      }),
    };
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const result = await runLiveStagedTurn({
      nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm,
      limits: { beats: 32, calls: 8, generations: 4, continuations: 2 },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([
      { kind: 'text', beatId: expect.any(String), text: 'Round one narration.' },
      { kind: 'text', beatId: expect.any(String), text: 'Round two narration.' },
    ]);
    expect(llm.complete).toHaveBeenCalledTimes(4);
    const round2PlanPrompt = llm.complete.mock.calls[2][0].prompt as string;
    expect(round2PlanPrompt).toContain('continuation of the same turn');
    expect(round2PlanPrompt).toContain('Round one narration.');
  });

  it('a continuation round that never compiles keeps round 1\'s items and reports a continuationWarning instead of discarding them', async () => {
    let planCalls = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
        if (request.label === 'Staged workflow plan') {
          planCalls++;
          if (planCalls === 1) {
            const payload = JSON.parse(request.prompt.split('\n').pop()!);
            return { text: JSON.stringify(narrationPlan(payload, 1)) };
          }
          return { text: JSON.stringify({ version: 'wrong-version', catalogRevision: 'x', continuations: 0, instances: [], beats: [] }) };
        }
        return { text: 'Round one narration.' };
      }),
    };
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const result = await runLiveStagedTurn({
      nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm,
      limits: { beats: 32, calls: 8, generations: 4, continuations: 1 },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([{ kind: 'text', beatId: expect.any(String), text: 'Round one narration.' }]);
    expect(result.continuationWarning).toContain('did not compile');
    expect(llm.complete).toHaveBeenCalledTimes(2 + maxCompileAttempts);
  });

  it('a continuation round\'s run failure returns run-failed with round 1\'s items preserved in retry.priorItems', async () => {
    let planCalls = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
        if (request.label === 'Staged workflow plan') {
          planCalls++;
          const payload = JSON.parse(request.prompt.split('\n').pop()!);
          return { text: JSON.stringify(planCalls === 1 ? narrationPlan(payload, 1) : whatsupPlan(payload)) };
        }
        return { text: planCalls === 1 ? 'Round one narration.' : 'Hey Bob, just checking in.' };
      }),
    };
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const result = await runLiveStagedTurn({
      nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm,
      limits: { beats: 32, calls: 8, generations: 4, continuations: 1 },
    });
    expect(result.status).toBe('run-failed');
    if (result.status !== 'run-failed') return;
    expect(result.retry.priorItems).toEqual([{ kind: 'text', beatId: expect.any(String), text: 'Round one narration.' }]);
  });

  it('stops after the configured continuation limit even if the model keeps requesting more', async () => {
    let planCalls = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
        if (request.label === 'Staged workflow plan') {
          planCalls++;
          const payload = JSON.parse(request.prompt.split('\n').pop()!);
          return { text: JSON.stringify(narrationPlan(payload, 1)) };
        }
        return { text: `Round ${planCalls} narration.` };
      }),
    };
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const result = await runLiveStagedTurn({
      nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm,
      limits: { beats: 32, calls: 8, generations: 4, continuations: 1 },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items).toEqual([
      { kind: 'text', beatId: expect.any(String), text: 'Round 1 narration.' },
      { kind: 'text', beatId: expect.any(String), text: 'Round 2 narration.' },
    ]);
    expect(llm.complete).toHaveBeenCalledTimes(4);
    const round2PlanPrompt = llm.complete.mock.calls[2][0].prompt as string;
    expect(round2PlanPrompt).toContain('This is the last round available');
  });

  it('declaring continuations without the route opting in (limit 0, the default) fails to compile', async () => {
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
        if (request.label !== 'Staged workflow plan') return { text: 'irrelevant' };
        const payload = JSON.parse(request.prompt.split('\n').pop()!);
        return { text: JSON.stringify(narrationPlan(payload, 1)) };
      }),
    };
    const result = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', scope, llm });
    expect(result.status).toBe('compile-failed');
  });
});

describe('runLiveStagedTurn', () => {
  it('compiles and runs an empty plan end to end with zero stages and zero items', async () => {
    const llm = fakeLlm(JSON.stringify({ version: 'staged-v1', catalogRevision: 'turn:catalog', continuations: 0, instances: [], beats: [] }));
    const result = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hello there', scope, llm });
    expect(result).toEqual({
      status: 'ok', stages: 0, items: [],
      plan: expect.any(Object), runStages: [],
    });
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('retries a compile-failed plan with the compiler issues as feedback, up to the attempt limit, before giving up', async () => {
    const llm = fakeLlm(JSON.stringify({ version: 'wrong-version', catalogRevision: 'turn:catalog', continuations: 0, instances: [], beats: [] }));
    const result = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', scope, llm });
    expect(result.status).toBe('compile-failed');
    if (result.status !== 'compile-failed') return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.attempts).toBe(maxCompileAttempts);
    expect(llm.complete).toHaveBeenCalledTimes(maxCompileAttempts);
    // Every retry after the first carries the previous attempt's compiler issues as feedback.
    const prompts = llm.complete.mock.calls.map((call: unknown[]) => (call[0] as { prompt: string }).prompt);
    expect(prompts[0]).not.toContain('was rejected by the compiler');
    for (const prompt of prompts.slice(1)) expect(prompt).toContain('was rejected by the compiler');
  });

  it('stops retrying as soon as a corrected plan compiles', async () => {
    let call = 0;
    const llm = {
      complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
        if (request.label !== 'Staged workflow plan') return { text: 'irrelevant' };
        call++;
        if (call === 1) return { text: JSON.stringify({ version: 'wrong-version', catalogRevision: 'turn:catalog', continuations: 0, instances: [], beats: [] }) };
        return { text: JSON.stringify({ version: 'staged-v1', catalogRevision: 'turn:catalog', continuations: 0, instances: [], beats: [] }) };
      }),
    };
    const result = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', scope, llm });
    expect(result).toEqual({ status: 'ok', stages: 0, items: [], plan: expect.any(Object), runStages: [] });
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('without an action bridge, never performs a real effect: an executor-backed instance fails at the stubbed stage', async () => {
    const llm = planLlm(whatsupPlan);
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const result = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(result.status).toBe('run-failed');
    if (result.status === 'run-failed') {
      expect(result.error).toContain('not enabled for this run');
      expect(result.stages).toBe(2);
    }
    // The content draft ran for real; the effectful stage never reached a real bridge.
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('with a real action bridge, runs the effect for real and returns a ready-to-commit composed item', async () => {
    const llm = planLlm(whatsupPlan);
    const [primaryCharacterId] = storyCharacterIds(storyNodes());
    const execute = vi.fn().mockResolvedValue({
      version: 1, blocks: [{ type: 'action', operationId: 'op-1' }],
      operations: [{ id: 'op-1', status: 'committed', result: { type: 'messenger.sent', messageId: 7, fromId: 'a', toId: 'b', text: 'Hey Bob, just checking in.' } }],
    });
    const actionBridge: StagedActionBridge = {
      getCatalog: () => ({ scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'c' }, entries: [
        { handle: 'person_1', id: primaryCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: ['whatsup.send'] },
        { handle: 'person_2', id: storyCharacterIds(storyNodes())[1], saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
      ] }),
      execute,
    };
    const result = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm, actionBridge });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'ok', stages: 2,
      plan: expect.any(Object), runStages: expect.any(Array),
      items: [{ kind: 'receipt', beatId: expect.any(String), operationId: 'op-1', receiptId: 'message:7' }],
    });
  });

  it('resumes a failed attempt from its own retry state without replanning or regenerating content (S8)', async () => {
    const llm = planLlm(whatsupPlan);
    const [primaryCharacterId, otherCharacterId] = storyCharacterIds(storyNodes());
    const failed = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    expect(failed.status).toBe('run-failed');
    if (failed.status !== 'run-failed') return;
    // Plan call + one content draft call happened for real before the stubbed effect failed.
    expect(llm.complete).toHaveBeenCalledTimes(2);

    const execute = vi.fn().mockResolvedValue({
      version: 1, blocks: [{ type: 'action', operationId: 'op-1' }],
      operations: [{ id: 'op-1', status: 'committed', result: { type: 'messenger.sent', messageId: 7, fromId: 'a', toId: 'b', text: 'Hey Bob, just checking in.' } }],
    });
    const actionBridge: StagedActionBridge = {
      getCatalog: () => ({ scope: { saveId: 'save', branchId: 'branch', turnId: 'turn', catalogId: 'c' }, entries: [
        { handle: 'person_1', id: primaryCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: ['whatsup.send'] },
        { handle: 'person_2', id: otherCharacterId, saveId: 'save', branchId: 'branch', state: 'available', kind: 'character', capabilities: [] },
      ] }),
      execute,
    };
    const resumed = await runLiveStagedTurn({
      nodes: storyNodes(), messages: [], currentInputText: 'irrelevant on resume', scope, llm, actionBridge,
      resume: failed.retry,
    });
    // Neither the plan call nor the content draft ran again - only the previously stubbed
    // effect stage retried, this time against a real action bridge.
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(resumed).toEqual({
      status: 'ok', stages: 2,
      plan: expect.any(Object), runStages: expect.any(Array),
      items: [{ kind: 'receipt', beatId: expect.any(String), operationId: 'op-1', receiptId: 'message:7' }],
    });
  });

  it('propagates a malformed plan reply as a rejection rather than guessing', async () => {
    const llm = fakeLlm('not json at all');
    await expect(runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', scope, llm }))
      .rejects.toThrow('Staged plan reply is not valid JSON');
  });
});
