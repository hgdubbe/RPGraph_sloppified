import { describe, expect, it, vi } from 'vitest';
import type { WorkflowNode } from '../types';
import { starterRpStorybook, rpStorybookJsonText } from '../nodes/rp-storybook/model';
import { storyCharactersFromNodes } from '../storybook/runtime';
import { runLiveStagedTurn } from './runLiveStagedTurn';
import { deserializeStagedRetryState, serializeStagedRetryState } from './stagedRetryPersistence';
import type { StagedActionBridge } from './stagedActionAdapter';

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

function planLlm(contentText = 'Hey Bob, just checking in.') {
  return {
    complete: vi.fn().mockImplementation(async (request: { prompt: string; label?: string }) => {
      if (request.label === 'Staged workflow plan') {
        const payload = JSON.parse(request.prompt.split('\n').pop()!);
        const [alice, bob] = payload.characterIds as string[];
        const plan = {
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
        return { text: JSON.stringify(plan) };
      }
      return { text: contentText };
    }),
  };
}

describe('serializeStagedRetryState / deserializeStagedRetryState', () => {
  it('round-trips a real failed attempt through JSON and resumes it against a real action bridge', async () => {
    const llm = planLlm();
    const [primaryCharacterId, otherCharacterId] = storyCharactersFromNodes(storyNodes()).map((c) => c.id);
    const failed = await runLiveStagedTurn({ nodes: storyNodes(), messages: [], currentInputText: 'Hi', primaryCharacterId, scope, llm });
    if (failed.status !== 'run-failed') throw new Error(`Expected run-failed, got ${failed.status}`);

    // Simulate a durable write/read across an app restart: JSON round-trip in between.
    const persisted = JSON.parse(JSON.stringify(serializeStagedRetryState(failed.retry)));
    const restoredRetry = deserializeStagedRetryState(persisted);

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
      resume: restoredRetry,
    });
    // Neither the plan call nor the content draft ran again after restoring from disk.
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(resumed).toMatchObject({ status: 'ok', items: [{ kind: 'receipt', receiptId: 'message:7' }] });
  });
});
