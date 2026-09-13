import { describe, expect, it } from 'vitest';
import { buildBlockPlan, type DecisionBlockPlan } from './decisionBlocks';
import type { DecisionComposition } from './decisionSequence';
import type { DecisionSceneContext } from './decisionSceneContext';

function instructionOf(plan: DecisionBlockPlan, index = 0): string {
  const node = plan.nodes[index];
  if (node.kind !== 'content') throw new Error(`Expected a content node at index ${index}`);
  return node.instruction;
}

const scene: DecisionSceneContext = {
  situation: 'Test situation', actorId: 'actor-1', actorName: 'Alice',
  characters: { Alice: { id: 'actor-1', persona: 'Curious.', appearance: '' } },
  socialPosts: [],
};

function composition(overrides: Partial<DecisionComposition> = {}): DecisionComposition {
  return { narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 3, respectUserAgency: true, responseLengthText: '200-300', ...overrides };
}

describe('narrationBlock composition guidance', () => {
  it('forbids narrating the user\'s character when respectUserAgency is on', () => {
    const plan = buildBlockPlan({ type: 'narration' }, scene, composition({ respectUserAgency: true }));
    expect(instructionOf(plan)).toContain('never narrate, assume, or invent what the user\'s character says');
  });

  it('permits continuing the user\'s character when respectUserAgency is off', () => {
    const plan = buildBlockPlan({ type: 'narration' }, scene, composition({ respectUserAgency: false }));
    expect(instructionOf(plan)).toContain('You may also narrate what the user\'s character does or says');
  });

  it('reflects the narrativeness tier in the same instruction', () => {
    const plan = buildBlockPlan({ type: 'narration' }, scene, composition({ narrativeness: 0 }));
    expect(instructionOf(plan)).toContain('narration should almost never appear');
  });

  it('defaults to the balanced composition when none is passed', () => {
    const plan = buildBlockPlan({ type: 'narration' }, scene);
    expect(instructionOf(plan)).toContain('never narrate, assume, or invent');
  });
});

describe('other block types ignore composition', () => {
  it('image block content is unaffected by composition settings', () => {
    const withDefault = buildBlockPlan({ type: 'image' }, scene);
    const withOverrides = buildBlockPlan({ type: 'image' }, scene, composition({ respectUserAgency: false, narrativeness: 4 }));
    expect(instructionOf(withDefault)).toBe(instructionOf(withOverrides));
  });
});

describe('pictureMessageBlock (S13: send a picture, not just generate one)', () => {
  const twoCharacterScene: DecisionSceneContext = {
    situation: 'Test situation', actorId: 'actor-1', actorName: 'Alice',
    characters: {
      Alice: { id: 'actor-1', persona: 'Curious.', appearance: 'Tall, red hair.' },
      Bob: { id: 'actor-2', persona: 'Reserved.', appearance: '' },
    },
    socialPosts: [],
  };

  it('drafts an image prompt (using appearance) and an accompanying message (using persona) as two content nodes, "prompt" then "draft"', () => {
    const plan = buildBlockPlan({ type: 'picture-message', target: 'Bob' }, twoCharacterScene);
    expect(plan.nodes).toHaveLength(2);
    expect(plan.nodes[0].kind === 'content' && plan.nodes[0].id).toBe('prompt');
    expect(plan.nodes[1].kind === 'content' && plan.nodes[1].id).toBe('draft');
    expect(plan.context.actorAppearance).toBe('Tall, red hair.');
    expect(instructionOf(plan, 0)).toContain('to send to Bob');
    expect(instructionOf(plan, 1)).toContain('sends alongside that picture to Bob');
  });

  it('the message-draft node lists "prompt" in its contextKeys, so it can reference what the picture actually shows', () => {
    const plan = buildBlockPlan({ type: 'picture-message', target: 'Bob' }, twoCharacterScene);
    const draftNode = plan.nodes[1];
    expect(draftNode.kind === 'content' && draftNode.contextKeys).toContain('prompt');
  });
});

describe('Decision Router extras (styleTone / per-block overrides)', () => {
  it('leaves the plan untouched when no extras are given', () => {
    const withoutExtras = buildBlockPlan({ type: 'narration' }, scene);
    const withEmptyExtras = buildBlockPlan({ type: 'narration' }, scene, undefined, {});
    expect(withEmptyExtras).toEqual(withoutExtras);
  });

  it('folds a non-empty styleTone into context and every content node\'s contextKeys', () => {
    const plan = buildBlockPlan({ type: 'narration' }, scene, undefined, { styleTone: 'Terse and dry.' });
    expect(plan.context.styleTone).toBe('Terse and dry.');
    expect(plan.nodes[0].kind === 'content' && plan.nodes[0].contextKeys).toContain('styleTone');
  });

  it('ignores a blank/whitespace-only styleTone', () => {
    const plan = buildBlockPlan({ type: 'narration' }, scene, undefined, { styleTone: '   ' });
    expect(plan.context.styleTone).toBeUndefined();
  });

  it('wraps only the matching block type\'s instruction with before/after overrides', () => {
    const overridden = buildBlockPlan({ type: 'narration' }, scene, undefined, {
      overrides: { narration: { before: 'BEFORE.', after: 'AFTER.' } },
    });
    expect(instructionOf(overridden)).toMatch(/^BEFORE\. /);
    expect(instructionOf(overridden)).toMatch(/ AFTER\.$/);

    const unaffected = buildBlockPlan({ type: 'image' }, scene, undefined, {
      overrides: { narration: { before: 'BEFORE.', after: 'AFTER.' } },
    });
    expect(instructionOf(unaffected)).toBe(instructionOf(buildBlockPlan({ type: 'image' }, scene)));
  });
});
