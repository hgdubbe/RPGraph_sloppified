import { describe, expect, it, vi } from 'vitest';
import { runDecisionRecipe } from './runDecisionRecipe';
import { photoReactionRecipe } from './photoReactionRecipe';
import type { DecisionNode } from './types';

function scriptedLlm(answers: Record<string, string>) {
  return {
    complete: vi.fn().mockImplementation(async (request: { prompt: string; label: string }) => {
      const answer = answers[request.label];
      if (answer === undefined) throw new Error(`Unscripted call: ${request.label}`);
      return { text: answer };
    }),
  };
}

describe('runDecisionRecipe', () => {
  it('runs every node and threads a content node\'s output into a later node\'s context, by id', async () => {
    const nodes: DecisionNode[] = [
      { kind: 'content', id: 'a', instruction: 'Say something.', contextKeys: [] },
      { kind: 'decide', id: 'gate', question: 'Is it good?', contextKeys: ['a'] },
    ];
    const llm = scriptedLlm({ 'Content: a': 'hello there', 'Decision: gate': 'yes' });
    const outcomes = await runDecisionRecipe(nodes, {}, llm);
    expect(outcomes).toEqual([
      { kind: 'content', id: 'a', skipped: false, text: 'hello there' },
      { kind: 'decide', id: 'gate', value: true, raw: 'yes' },
    ]);
    const gatePrompt = llm.complete.mock.calls[1][0].prompt as string;
    expect(gatePrompt).toContain('a: hello there');
  });

  it('skips a gated content node without calling the LLM when its gate answers no', async () => {
    const nodes: DecisionNode[] = [
      { kind: 'decide', id: 'gate', question: 'Proceed?', contextKeys: [] },
      { kind: 'content', id: 'follow-up', gatedBy: 'gate', instruction: 'Continue.', contextKeys: [] },
    ];
    const llm = scriptedLlm({ 'Decision: gate': 'no' });
    const outcomes = await runDecisionRecipe(nodes, {}, llm);
    expect(outcomes).toEqual([
      { kind: 'decide', id: 'gate', value: false, raw: 'no' },
      { kind: 'content', id: 'follow-up', skipped: true },
    ]);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('scopes each node\'s prompt to only its declared context keys, leaking nothing else', async () => {
    const nodes: DecisionNode[] = [
      { kind: 'content', id: 'a', instruction: 'A.', contextKeys: ['x'] },
    ];
    const llm = scriptedLlm({ 'Content: a': 'ok' });
    await runDecisionRecipe(nodes, { x: 'visible-value', y: 'secret-value' }, llm);
    const prompt = llm.complete.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('visible-value');
    expect(prompt).not.toContain('secret-value');
  });

  it('photoReactionRecipe: runs all five nodes and never exposes character B\'s persona to the picture-content node', async () => {
    const { nodes, context } = photoReactionRecipe({
      situation: 'Alice is about to leave for a hike.', personaA: 'Alice is playful and a little vain.',
      personaB: 'Bob is dry and skeptical.', purpose: 'Show off the new hiking gear.',
    });
    const llm = scriptedLlm({
      'Decision: narrative-framing': 'yes',
      'Content: narrative-text': 'Alice struck a pose before heading out.',
      'Content: picture-content': 'A selfie in full hiking gear, grinning at the camera.',
      'Decision: reaction': 'yes',
      'Content: reaction-text': 'Nice gear, try not to get lost.',
    });
    const outcomes = await runDecisionRecipe(nodes, context, llm);
    expect(outcomes).toHaveLength(5);
    expect(llm.complete).toHaveBeenCalledTimes(5);
    const pictureCallPrompt = llm.complete.mock.calls.find((call) => call[0].label === 'Content: picture-content')![0].prompt as string;
    expect(pictureCallPrompt).not.toContain('Bob is dry and skeptical.');
    const reactionGatePrompt = llm.complete.mock.calls.find((call) => call[0].label === 'Decision: reaction')![0].prompt as string;
    expect(reactionGatePrompt).toContain('A selfie in full hiking gear, grinning at the camera.');
    expect(reactionGatePrompt).not.toContain('Alice is playful');
  });

  it('photoReactionRecipe: skips narrative and reaction text when their gates answer no, costing only 3 calls', async () => {
    const { nodes, context } = photoReactionRecipe({
      situation: 'A quiet afternoon.', personaA: 'Alice.', personaB: 'Bob.', purpose: 'Just sharing a view.',
    });
    const llm = scriptedLlm({
      'Decision: narrative-framing': 'no',
      'Content: picture-content': 'A quiet park bench in autumn light.',
      'Decision: reaction': 'no',
    });
    const outcomes = await runDecisionRecipe(nodes, context, llm);
    expect(outcomes).toEqual([
      { kind: 'decide', id: 'narrative-framing', value: false, raw: 'no' },
      { kind: 'content', id: 'narrative-text', skipped: true },
      { kind: 'content', id: 'picture-content', skipped: false, text: 'A quiet park bench in autumn light.' },
      { kind: 'decide', id: 'reaction', value: false, raw: 'no' },
      { kind: 'content', id: 'reaction-text', skipped: true },
    ]);
    expect(llm.complete).toHaveBeenCalledTimes(3);
  });
});
