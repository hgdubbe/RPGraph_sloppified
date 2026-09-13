import type { DecisionContext, DecisionNode } from './types';

export type PhotoReactionInput = {
  situation: string;
  personaA: string;
  personaB: string;
  purpose: string;
};

/**
 * The concrete worked example from the design discussion: character A sends character B a
 * picture. Five tiny, narrowly-scoped calls instead of one call holding all of it at once —
 * each node only sees the context it actually needs (e.g. the picture-content node never sees
 * character B's persona at all; the reaction gate never sees character A's).
 */
export function photoReactionRecipe(input: PhotoReactionInput): { nodes: DecisionNode[]; context: DecisionContext } {
  return {
    context: { situation: input.situation, personaA: input.personaA, personaB: input.personaB, purpose: input.purpose },
    nodes: [
      {
        kind: 'decide', id: 'narrative-framing', contextKeys: ['situation', 'personaA'],
        question: 'Does this moment need a short third-person narration beat introducing why the picture is being sent, beyond the picture itself?',
      },
      {
        kind: 'content', id: 'narrative-text', gatedBy: 'narrative-framing', contextKeys: ['situation', 'personaA'],
        instruction: 'Write one short third-person narration beat (1-3 sentences) introducing why the picture is being sent, matching the character\'s voice.',
      },
      {
        kind: 'content', id: 'picture-content', contextKeys: ['situation', 'personaA', 'purpose'],
        instruction: 'Describe, in plain descriptive language suitable for an image generation prompt, exactly what is shown in the picture.',
      },
      {
        kind: 'decide', id: 'reaction', contextKeys: ['personaB', 'picture-content'],
        question: 'Would this character realistically send a reaction message back after receiving this picture?',
      },
      {
        kind: 'content', id: 'reaction-text', gatedBy: 'reaction', contextKeys: ['personaB', 'picture-content'],
        instruction: 'Write the reaction message this character sends back, in their own voice, reacting specifically to what is in the picture.',
      },
    ],
  };
}
