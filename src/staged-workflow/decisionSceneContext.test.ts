import { describe, expect, it } from 'vitest';
import type { WorkflowNode } from '../types';
import { starterRpStorybook, rpStorybookJsonText } from '../nodes/rp-storybook/model';
import { captureDecisionContext } from './decisionSceneContext';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };

function storyNodes(): WorkflowNode[] {
  const story = structuredClone(starterRpStorybook);
  story.characters = [{ ...structuredClone(story.characters[0]), id: 'alice', name: 'Alice' }];
  return [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
}

function capture(options: Partial<Parameters<typeof captureDecisionContext>[0]> = {}) {
  return captureDecisionContext({
    nodes: storyNodes(), messages: [], currentInputText: '', scope, catalogRevision: 'rev-1', instructionsText: '',
    ...options,
  });
}

describe('captureDecisionContext — situation derivation', () => {
  it('with no Decision Router node (no routedContext), situation is exactly the current-input text — unchanged behavior', () => {
    const { scene } = capture({ currentInputText: 'Alice waves hello.' });
    expect(scene.situation).toBe('Alice waves hello.');
    expect(scene.routedContext).toBeUndefined();
  });

  it('with no current input and no routedContext, situation is empty', () => {
    const { scene } = capture({ currentInputText: '' });
    expect(scene.situation).toBe('');
  });

  it('with a Decision Router node, folds every non-empty routed field into a labeled situation, dropping empty ones', () => {
    const { scene } = capture({
      currentInputText: 'Alice waves hello.',
      routedContext: { history: 'Bob left the room.', eventManager: '', contextCompression: undefined, lastInput: 'Hi Alice!' },
    });
    expect(scene.situation).toBe(
      'Current input: Alice waves hello.\nRecent history: Bob left the room.\nLast user message: Hi Alice!',
    );
  });

  it('with a Decision Router node but every field empty, situation is empty', () => {
    const { scene } = capture({ currentInputText: '', routedContext: {} });
    expect(scene.situation).toBe('');
  });

  it('exposes the raw routedContext bundle on the scene for future block-level use', () => {
    const routedContext = { storybookCharacters: 'Alice: curious explorer.' };
    const { scene } = capture({ routedContext });
    expect(scene.routedContext).toEqual(routedContext);
  });
});
