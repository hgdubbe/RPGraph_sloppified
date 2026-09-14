import { describe, expect, it } from 'vitest';
import {
  availableBlockTypes, buildSequencePrompt, parseSequence, resolveActiveness, resolveDecisionComposition,
  type DecisionComposition,
} from './decisionSequence';
import type { DecisionSceneContext } from './decisionSceneContext';

function scene(activeness?: number): DecisionSceneContext {
  return {
    situation: 'Test situation', actorId: 'actor-1', actorName: 'Alice',
    characters: { Alice: { id: 'actor-1', persona: '', appearance: '', activeness } },
    socialPosts: [],
  };
}

function composition(overrides: Partial<DecisionComposition> = {}): DecisionComposition {
  return { narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 3, respectUserAgency: true, responseLengthText: '200-300', ...overrides };
}

describe('parseSequence', () => {
  it('parses one action per line, with or without a recipient', () => {
    expect(parseSequence('narration\nwhatsup-message: Bob', ['narration', 'whatsup-message'])).toEqual([
      { type: 'narration', target: undefined },
      { type: 'whatsup-message', target: 'Bob' },
    ]);
  });

  it('tolerates numbering/bullets, ignores blank lines, and drops unknown or disallowed types', () => {
    expect(parseSequence('1. narration\n\n- whatsup-message: Bob\nimage: Bob\n', ['narration', 'whatsup-message'])).toEqual([
      { type: 'narration', target: undefined },
      { type: 'whatsup-message', target: 'Bob' },
    ]);
  });

  it('strips trailing dialogue a model appends after the recipient name, found live against a real model', () => {
    expect(parseSequence('voice-message: Bob "I was looking at your photo... you look amazing."', ['voice-message'])).toEqual([
      { type: 'voice-message', target: 'Bob', detail: undefined },
    ]);
  });

  it('tolerates markdown blockquote decoration (">type"), found live against a real model', () => {
    expect(parseSequence('>narration\n>whatsup-message: Bob', ['narration', 'whatsup-message'])).toEqual([
      { type: 'narration', target: undefined },
      { type: 'whatsup-message', target: 'Bob' },
    ]);
  });

  it('an unparseable reply produces an empty sequence rather than throwing', () => {
    expect(parseSequence('nothing happens this turn', ['narration', 'whatsup-message'])).toEqual([]);
  });

  it('splits a trailing comma-separated pair into target and detail (bank-transfer: recipient, amount)', () => {
    expect(parseSequence('bank-transfer: Bob, 20', ['bank-transfer'])).toEqual([
      { type: 'bank-transfer', target: 'Bob', detail: '20' },
    ]);
  });

  it('a single trailing value (no comma) is the target, with detail left undefined', () => {
    expect(parseSequence('social-post: onlyfriends', ['social-post'])).toEqual([
      { type: 'social-post', target: 'onlyfriends', detail: undefined },
    ]);
  });

  it('given the real character list, trims trailing words glued onto a recipient with no quote to mark the cut, found live against a real model', () => {
    expect(parseSequence('whatsup-message: Avery Hart stfu!', ['whatsup-message'], ['Ryan Parker', 'Avery Hart', 'Helga Harper']))
      .toEqual([{ type: 'whatsup-message', target: 'Avery Hart', detail: undefined }]);
  });

  it('leaves a target untouched when no known character name is a prefix of it', () => {
    expect(parseSequence('whatsup-message: Someone Else Entirely', ['whatsup-message'], ['Ryan Parker', 'Avery Hart']))
      .toEqual([{ type: 'whatsup-message', target: 'Someone Else Entirely', detail: undefined }]);
  });

  it('does not apply character-name trimming to a type whose target is not a character (social-post app)', () => {
    expect(parseSequence('social-post: onlyfriends', ['social-post'], ['Onlyfriends Smith']))
      .toEqual([{ type: 'social-post', target: 'onlyfriends', detail: undefined }]);
  });
});

describe('availableBlockTypes', () => {
  it('offers every type when no allow-list is set', () => {
    expect(availableBlockTypes()).toEqual([
      'narration', 'whatsup-message', 'voice-message', 'image', 'picture-message', 'note', 'bank-transfer',
      'social-post', 'social-comment', 'assistant-chat',
    ]);
  });

  it('narrows to the route\'s recipe allow-list (S9), by recipe id not block-type name', () => {
    expect(availableBlockTypes(['narration.speech'])).toEqual(['narration']);
    expect(availableBlockTypes(['whatsup.message'])).toEqual(['whatsup-message']);
    expect(availableBlockTypes(['bank.transfer'])).toEqual(['bank-transfer']);
    expect(availableBlockTypes(['social.comment'])).toEqual(['social-comment']);
    expect(availableBlockTypes(['whatsup.picture-message'])).toEqual(['picture-message']);
    expect(availableBlockTypes(['messenger.exchange'])).toEqual([]);
  });
});

describe('resolveDecisionComposition', () => {
  it('defaults every field when the node data has none set', () => {
    expect(resolveDecisionComposition({}, '200-300')).toEqual({
      narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 3, respectUserAgency: true, responseLengthText: '200-300',
    });
  });

  it('carries through explicitly set values', () => {
    expect(resolveDecisionComposition({
      decisionNarrativeness: 4, decisionDefaultActiveness: 0, decisionMaxActionsPerTurn: 5, decisionRespectUserAgency: false,
    }, '50-100')).toEqual({
      narrativeness: 4, defaultActiveness: 0, maxActionsPerTurn: 5, respectUserAgency: false, responseLengthText: '50-100',
    });
  });
});

describe('resolveActiveness', () => {
  it('uses the route default when the character has no override', () => {
    expect(resolveActiveness(scene(undefined), composition({ defaultActiveness: 3 }))).toBe(3);
  });

  it('prefers the character\'s own override over the route default', () => {
    expect(resolveActiveness(scene(0), composition({ defaultActiveness: 3 }))).toBe(0);
  });
});

describe('buildSequencePrompt composition guidance', () => {
  it('includes the hard-cap line with the configured max', () => {
    const prompt = buildSequencePrompt(scene(), ['narration'], composition({ maxActionsPerTurn: 5 }));
    expect(prompt).toContain('Never produce more than 5 non-narration action lines this turn');
  });

  it('reflects the character\'s own activeness override, not the route default, in the tendency line', () => {
    const low = buildSequencePrompt(scene(0), ['narration'], composition({ defaultActiveness: 4 }));
    expect(low).toContain('rarely does more than the one clearly necessary thing');
    const high = buildSequencePrompt(scene(4), ['narration'], composition({ defaultActiveness: 0 }));
    expect(high).toContain('tends to follow through with several actions in a row');
  });

  it('varies narration guidance by tier and includes the response-length target at higher tiers', () => {
    const off = buildSequencePrompt(scene(), ['narration'], composition({ narrativeness: 0 }));
    expect(off).toContain('narration should almost never appear');
    const high = buildSequencePrompt(scene(), ['narration'], composition({ narrativeness: 4, responseLengthText: '400-600' }));
    expect(high).toContain('400-600');
  });

  it('clarifies social-post\'s trailing value is an app name, never a character (found live: a model wrote "social-post: David", got silently dropped)', () => {
    const prompt = buildSequencePrompt(scene(), ['social-post'], composition());
    expect(prompt).toContain('never a character\'s name');
  });

  it('always includes the medium-continuity line as a described tendency, not a rule', () => {
    const prompt = buildSequencePrompt(scene(), ['narration'], composition());
    expect(prompt).toContain('common but not required');
  });

  it('allows the character to skip responding entirely as a natural-behavior option, not just a same-medium/different-medium choice', () => {
    const prompt = buildSequencePrompt(scene(), ['narration'], composition());
    expect(prompt).toContain('skip responding to it entirely if something else feels more natural');
  });

  it('states the real character roster so the model can\'t invent a nonexistent recipient (found live: an invented name silently drops the whole block)', () => {
    const twoCharacterScene: DecisionSceneContext = {
      situation: 'Test', actorId: 'actor-1', actorName: 'Alice',
      characters: {
        Alice: { id: 'actor-1', persona: '', appearance: '' },
        Bob: { id: 'actor-2', persona: '', appearance: '' },
      },
      socialPosts: [],
    };
    const prompt = buildSequencePrompt(twoCharacterScene, ['narration', 'whatsup-message'], composition());
    expect(prompt).toContain('Characters who actually exist in this story: Alice, Bob');
    expect(prompt).toContain('never invent a new character');
  });
});
