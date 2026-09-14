import { runDecisionRecipe } from './runDecisionRecipe';
import type { DecisionContext, DecisionLlm, DecisionNode, DecisionOutcome } from './types';

/**
 * Generalizes photoReactionRecipe.ts's fixed node order into a dynamic one: the model first
 * decides WHICH block types happen this turn and in WHAT order (no fixed shape — "just an
 * image", "voice message then whatsup message then narration", etc.), then each chosen block
 * runs its own small decision-recipe. Still fully standalone; still zero wiring into the app.
 */

type BlockType = 'narration' | 'whatsup-message' | 'voice-message' | 'image';

const knownBlockTypes: BlockType[] = ['narration', 'whatsup-message', 'voice-message', 'image'];

export type BlockRequest = { type: BlockType; target?: string };

type CharacterProfile = {
  /** Behavior/voice — how the character acts and talks. Never fed into an image prompt. */
  persona: string;
  /** Physical description — what the character looks like. Only relevant to `image` blocks;
   * without this, an image model has no idea who "Alice" is, only what the scene says is
   * happening (see the real feedback that prompted this field: Flux can follow prose fine, it
   * just has zero notion of a named character's appearance unless told explicitly). */
  appearance?: string;
};

export type SceneContext = {
  situation: string;
  actorName: string;
  characters: Record<string, CharacterProfile>;
};

function findCharacter(scene: SceneContext, name: string | undefined): CharacterProfile | undefined {
  if (!name) return undefined;
  const key = Object.keys(scene.characters).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? scene.characters[key] : undefined;
}

/** The one call with any real "planning" left in it — and it's tiny: a short ordered list of
 * block-type names, not a structured JSON plan. No refs, no IDs, no dependency wiring. */
function buildSequencePrompt(scene: SceneContext): string {
  return [
    `Situation: ${scene.situation}`,
    `${scene.actorName} is deciding what to do this turn. Available action types:`,
    '- narration: a short third-person narrative beat, no message sent to anyone.',
    '- whatsup-message: a text message sent to another character (name the recipient).',
    '- voice-message: a spoken voice message sent to another character (name the recipient).',
    '- image: a picture sent to another character (name the recipient).',
    'Decide which of these should happen this turn, and in what order. There is no fixed number and no fixed order — it could be just one, or several in any sequence.',
    'Reply with exactly one action per line, in the order they should happen. Each line is either the type alone, or "type: recipient name". Nothing else — no numbering, no explanation.',
  ].join('\n');
}

export function parseSequence(text: string): BlockRequest[] {
  const requests: BlockRequest[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().replace(/^[-*\d.)\s]+/, '');
    if (!line) continue;
    const [typePart, ...rest] = line.split(':');
    const type = typePart.trim().toLowerCase();
    if (!knownBlockTypes.includes(type as BlockType)) continue;
    const target = rest.join(':').trim() || undefined;
    requests.push({ type: type as BlockType, target });
  }
  return requests;
}

type BlockBuilder = (request: BlockRequest, scene: SceneContext) => { nodes: DecisionNode[]; context: DecisionContext };

const narrationBlock: BlockBuilder = (_request, scene) => ({
  context: { situation: scene.situation, actorPersona: findCharacter(scene, scene.actorName)?.persona ?? '' },
  nodes: [
    { kind: 'content', id: 'narration-text', contextKeys: ['situation', 'actorPersona'],
      instruction: `Write a short third-person narration beat (1-3 sentences) for what ${scene.actorName} is doing right now.` },
  ],
});

const whatsupMessageBlock: BlockBuilder = (request, scene) => {
  const target = findCharacter(scene, request.target);
  return {
    context: {
      situation: scene.situation,
      actorPersona: findCharacter(scene, scene.actorName)?.persona ?? '',
      ...(target ? { targetPersona: target.persona } : {}),
    },
    nodes: [
      { kind: 'content', id: 'message-text', contextKeys: target ? ['situation', 'actorPersona', 'targetPersona'] : ['situation', 'actorPersona'],
        instruction: `Write the text message ${scene.actorName} sends${request.target ? ` to ${request.target}` : ''}, in their own voice.` },
    ],
  };
};

const voiceMessageBlock: BlockBuilder = (request, scene) => {
  const target = findCharacter(scene, request.target);
  return {
    context: {
      situation: scene.situation,
      actorPersona: findCharacter(scene, scene.actorName)?.persona ?? '',
      ...(target ? { targetPersona: target.persona } : {}),
    },
    nodes: [
      { kind: 'content', id: 'message-text', contextKeys: target ? ['situation', 'actorPersona', 'targetPersona'] : ['situation', 'actorPersona'],
        instruction: `Write what ${scene.actorName} says in a spoken voice message${request.target ? ` to ${request.target}` : ''}, in their own voice.` },
    ],
  };
};

const imageBlock: BlockBuilder = (request, scene) => {
  const actor = findCharacter(scene, scene.actorName);
  const target = findCharacter(scene, request.target);
  return {
    context: {
      situation: scene.situation,
      actorPersona: actor?.persona ?? '',
      actorAppearance: actor?.appearance ?? '',
      ...(target ? { targetPersona: target.persona } : {}),
    },
    nodes: [
      { kind: 'decide', id: 'narrative-framing', contextKeys: ['situation', 'actorPersona'],
        question: 'Does this moment need a short third-person narration beat introducing why the picture is being sent, beyond the picture itself?' },
      { kind: 'content', id: 'narrative-text', gatedBy: 'narrative-framing', contextKeys: ['situation', 'actorPersona'],
        instruction: 'Write one short third-person narration beat (1-3 sentences) introducing why the picture is being sent.' },
      // Appearance, not persona: the image model has no idea who this character is beyond
      // what's said here. Behavior/voice traits are irrelevant to what a still image shows.
      { kind: 'content', id: 'picture-content', contextKeys: ['situation', 'actorAppearance'],
        instruction: 'Describe, in plain descriptive language suitable for an image generation prompt, exactly what the picture shows, including the subject\'s physical appearance.' },
      ...(request.target ? [
        { kind: 'decide' as const, id: 'reaction', contextKeys: ['targetPersona', 'picture-content'],
          question: `Would ${request.target} realistically send a reaction message back after receiving this picture?` },
        { kind: 'content' as const, id: 'reaction-text', gatedBy: 'reaction', contextKeys: ['targetPersona', 'picture-content'],
          instruction: `Write the reaction message ${request.target} sends back, in their own voice, reacting specifically to what is in the picture.` },
      ] : []),
    ],
  };
};

const blockBuilders: Record<BlockType, BlockBuilder> = {
  narration: narrationBlock,
  'whatsup-message': whatsupMessageBlock,
  'voice-message': voiceMessageBlock,
  image: imageBlock,
};

type DynamicTurnBlockResult = { request: BlockRequest; outcomes: DecisionOutcome[] };
export type DynamicTurnResult = { sequence: BlockRequest[]; blocks: DynamicTurnBlockResult[] };

/** Runs the sequence-decision call, then each chosen block's own decision-recipe in order. */
export async function runDynamicTurn(scene: SceneContext, llm: DecisionLlm): Promise<DynamicTurnResult> {
  const sequenceResult = await llm.complete({ prompt: buildSequencePrompt(scene), label: 'Sequence decision', purpose: 'Dynamic turn sequence' });
  const sequence = parseSequence(sequenceResult.text);
  const blocks: DynamicTurnBlockResult[] = [];
  for (const request of sequence) {
    const { nodes, context } = blockBuilders[request.type](request, scene);
    const outcomes = await runDecisionRecipe(nodes, context, llm);
    blocks.push({ request, outcomes });
  }
  return { sequence, blocks };
}
