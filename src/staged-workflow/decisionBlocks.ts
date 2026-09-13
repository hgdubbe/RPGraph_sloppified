import { validateAssistantChatMessages } from '../actions/assistantChatMessages';
import { actionLimits } from '../actions/schema';
import { parseJsonReply } from '../llm/extractJsonReply';
import type { DecisionContext, DecisionNode } from './decisionNodes';
import { latestPostByAuthor, type DecisionSceneContext } from './decisionSceneContext';
import {
  defaultDecisionComposition, narrativenessTierPhrase,
  type DecisionBlockRequest, type DecisionBlockType, type DecisionComposition,
} from './decisionSequence';

/** Reused by the assistant-chat node's `validate` (throws with a message fed back as
 * corrective feedback on retry) and, redundantly but harmlessly, by decisionAssembler.ts when
 * it writes the now-known-valid value to the store. */
function validateAssistantChatJson(text: string): void {
  const parsed = parseJsonReply(text, 'Expected a JSON array of 2 to 8 alternating messages.');
  validateAssistantChatMessages(parsed, {
    maxTextLength: actionLimits.text, fail: (path, message): never => { throw new Error(`${path}: ${message}`); },
  });
}

/**
 * One node tree per block type. Node ids are deliberately chosen to match the recipe step
 * `key` they fulfill (see recipeInventory.ts's `stagedRecipeDefinitions()`), so
 * decisionAssembler.ts can pair a realized `content` outcome to its recipe step by id alone.
 *
 * "If a concrete detail isn't given, invent one" is the direct fix for a real bug hit against
 * a local model this session: a message-drafting call needed a fact nobody had established
 * (what a gift package contained) and produced a bracket placeholder instead of a plausible
 * detail. A proper fact-establishing node type is a documented fast-follow, not required here.
 */
const inventDetailRule = 'If a concrete detail isn\'t given, invent one specific, plausible detail yourself; never use a placeholder or bracket.';

export type DecisionBlockPlan = { nodes: DecisionNode[]; context: DecisionContext };

/** Per-block-type wrapper text around that block's built-in instruction, set from the
 * Decision Router node's config UI. Wraps only — the built-in instructions stay hardcoded
 * (they're tuned for format-compliance, e.g. "Return plain text only"), so `before`/`after`
 * are prepended/appended rather than replacing anything. */
export type DecisionBlockOverrides = Partial<Record<DecisionBlockType, { before?: string; after?: string }>>;

/** Optional free-text guidance folded into every content block's prompt context (Decision
 * Router's "Style/Tone" field) — additive, since decisionNodes.ts's `renderContext` already
 * renders whatever keys are present in a node's `contextKeys`. */
export type DecisionBlockExtras = { styleTone?: string; overrides?: DecisionBlockOverrides };

function applyBlockExtras(plan: DecisionBlockPlan, type: DecisionBlockType, extras?: DecisionBlockExtras): DecisionBlockPlan {
  if (!extras) return plan;
  const override = extras.overrides?.[type];
  const styleTone = extras.styleTone?.trim();
  if (!override?.before && !override?.after && !styleTone) return plan;
  return {
    context: styleTone ? { ...plan.context, styleTone } : plan.context,
    nodes: plan.nodes.map((node) => {
      if (node.kind !== 'content') return node;
      return {
        ...node,
        contextKeys: styleTone ? [...node.contextKeys, 'styleTone'] : node.contextKeys,
        instruction: [override?.before?.trim(), node.instruction, override?.after?.trim()].filter(Boolean).join(' '),
      };
    }),
  };
}

/** The only block whose instruction reads `composition` — every other block type is already
 * scoped to the NPC actor by construction (they narrate/draft only that character's own
 * message/action), so `respectUserAgency` and the narrativeness density guidance only matter
 * here. See decisionSequence.ts's `DecisionComposition` doc comment for why this is phrased
 * guidance, not an enforced rule. */
function narrationBlock(_request: DecisionBlockRequest, scene: DecisionSceneContext, composition: DecisionComposition): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  const agencyRule = composition.respectUserAgency
    ? `Only narrate ${scene.actorName}'s own actions, thoughts, and speech — never narrate, assume, or invent what the user's character says, thinks, decides, or does. Leave room for the user to respond.`
    : `You may also narrate what the user's character does or says in response, continuing the scene naturally, if it fits the moment.`;
  const densityRule = narrativenessTierPhrase(composition.narrativeness, composition.responseLengthText);
  return {
    context: { situation: scene.situation, actorPersona: actor?.persona ?? '' },
    nodes: [
      { kind: 'content', id: 'speech', contextKeys: ['situation', 'actorPersona'],
        instruction: `Write a third-person narration beat for what ${scene.actorName} is doing right now. ${inventDetailRule} ${agencyRule} ${densityRule}.` },
    ],
  };
}

/** Shared by whatsup-message and voice-message: identical recipe shape (one `draft` text
 * step feeding one `receipt` action step), differing only in delivery medium and wording. */
function messageBlock(medium: 'text message' | 'voice message', request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  const target = request.target ? scene.characters[request.target] : undefined;
  return {
    context: {
      situation: scene.situation, actorPersona: actor?.persona ?? '',
      ...(target ? { targetPersona: target.persona } : {}),
    },
    nodes: [
      { kind: 'content', id: 'draft', contextKeys: target ? ['situation', 'actorPersona', 'targetPersona'] : ['situation', 'actorPersona'],
        instruction: `Write the WhatsUp ${medium} ${scene.actorName} sends${request.target ? ` to ${request.target}` : ''}, in their own voice. ${inventDetailRule}` },
    ],
  };
}

function imageBlock(_request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  return {
    // Appearance, never persona: an image model has no idea who this character is beyond what
    // is said here, and their behavior/voice traits are irrelevant to what a still image shows.
    context: { situation: scene.situation, actorAppearance: actor?.appearance ?? '' },
    nodes: [
      { kind: 'content', id: 'prompt', contextKeys: ['situation', 'actorAppearance'],
        instruction: `Describe, in plain descriptive language suitable for an image generation prompt, a picture ${scene.actorName} takes of themselves right now, including their physical appearance. ${inventDetailRule}` },
    ],
  };
}

/** Combines imageBlock's prompt-drafting with messageBlock's draft-drafting into one block —
 * see recipeInventory.ts's `whatsup.picture-message` for why this needs to be one recipe
 * rather than two chained ones (no cross-instance references in decision-v1). The 'draft'
 * node's `prompt` contextKey pulls in the drafted image description (decisionNodes.ts folds
 * every completed node's output back into the shared pool by its own id), so the accompanying
 * message can actually reference what the picture shows instead of being written blind. */
function pictureMessageBlock(request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  const target = request.target ? scene.characters[request.target] : undefined;
  return {
    context: {
      situation: scene.situation, actorAppearance: actor?.appearance ?? '', actorPersona: actor?.persona ?? '',
      ...(target ? { targetPersona: target.persona } : {}),
    },
    nodes: [
      { kind: 'content', id: 'prompt', contextKeys: ['situation', 'actorAppearance'],
        instruction: `Describe, in plain descriptive language suitable for an image generation prompt, a picture ${scene.actorName} takes of themselves right now to send${request.target ? ` to ${request.target}` : ''}, including their physical appearance. ${inventDetailRule}` },
      { kind: 'content', id: 'draft', contextKeys: target ? ['situation', 'actorPersona', 'targetPersona', 'prompt'] : ['situation', 'actorPersona', 'prompt'],
        instruction: `Write the short WhatsUp message ${scene.actorName} sends alongside that picture${request.target ? ` to ${request.target}` : ''}, in their own voice — it should make sense with what the picture (described in "prompt" below) actually shows. ${inventDetailRule}` },
    ],
  };
}

function noteBlock(_request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  return {
    context: { situation: scene.situation, actorPersona: actor?.persona ?? '' },
    nodes: [
      { kind: 'content', id: 'title', contextKeys: ['situation', 'actorPersona'],
        instruction: `Write a short title (a few words) for a phone Notes entry ${scene.actorName} is writing themselves right now. ${inventDetailRule}` },
      { kind: 'content', id: 'body', contextKeys: ['situation', 'actorPersona', 'title'],
        instruction: `Write the body text of that same Notes entry, matching its title. ${inventDetailRule}` },
    ],
  };
}

function bankTransferBlock(request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  const target = request.target ? scene.characters[request.target] : undefined;
  return {
    context: {
      situation: scene.situation, actorPersona: actor?.persona ?? '',
      ...(target ? { targetPersona: target.persona } : {}),
    },
    nodes: [
      { kind: 'content', id: 'note', contextKeys: target ? ['situation', 'actorPersona', 'targetPersona'] : ['situation', 'actorPersona'],
        instruction: `Write a short note (one sentence) ${scene.actorName} attaches to a bank transfer${request.target ? ` to ${request.target}` : ''}, explaining what it's for. ${inventDetailRule}` },
    ],
  };
}

function socialPostBlock(_request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  return {
    context: { situation: scene.situation, actorPersona: actor?.persona ?? '' },
    nodes: [
      { kind: 'content', id: 'draft', contextKeys: ['situation', 'actorPersona'],
        instruction: `Write a short social media post caption ${scene.actorName} shares right now, in their own voice. ${inventDetailRule}` },
    ],
  };
}

function socialCommentBlock(request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  const post = latestPostByAuthor(scene, request.target);
  return {
    context: {
      situation: scene.situation, actorPersona: actor?.persona ?? '',
      ...(post ? { postCaption: post.caption } : {}),
    },
    nodes: [
      { kind: 'content', id: 'draft', contextKeys: post ? ['situation', 'actorPersona', 'postCaption'] : ['situation', 'actorPersona'],
        instruction: `Write a short comment ${scene.actorName} leaves on ${request.target ?? 'a character'}'s recent post`
          + `${post ? ` (captioned "${post.caption}")` : ''}, in their own voice. ${inventDetailRule}` },
    ],
  };
}

function assistantChatBlock(_request: DecisionBlockRequest, scene: DecisionSceneContext): DecisionBlockPlan {
  const actor = scene.characters[scene.actorName];
  return {
    context: { situation: scene.situation, actorPersona: actor?.persona ?? '' },
    nodes: [
      { kind: 'content', id: 'messages', contextKeys: ['situation', 'actorPersona'], expectsJson: true, validate: validateAssistantChatJson,
        instruction: `Write a short logged conversation (2 to 8 messages, alternating, starting with the user) between ${scene.actorName} and their phone AI assistant, about whatever is on their mind right now. `
          + 'Return it as a JSON array like [{"role":"user","text":"..."},{"role":"assistant","text":"..."}]. '
          + `${inventDetailRule}` },
    ],
  };
}

/** Only `narrationBlock` reads `composition` — every other block type ignores the third
 * argument, already scoped to the NPC actor by construction. */
const blockBuilders: Record<DecisionBlockType, (request: DecisionBlockRequest, scene: DecisionSceneContext, composition: DecisionComposition) => DecisionBlockPlan> = {
  narration: narrationBlock,
  'whatsup-message': (request, scene) => messageBlock('text message', request, scene),
  'voice-message': (request, scene) => messageBlock('voice message', request, scene),
  image: imageBlock,
  'picture-message': pictureMessageBlock,
  note: noteBlock,
  'bank-transfer': bankTransferBlock,
  'social-post': socialPostBlock,
  'social-comment': socialCommentBlock,
  'assistant-chat': assistantChatBlock,
};

export function buildBlockPlan(
  request: DecisionBlockRequest, scene: DecisionSceneContext, composition: DecisionComposition = defaultDecisionComposition,
  extras?: DecisionBlockExtras,
): DecisionBlockPlan {
  return applyBlockExtras(blockBuilders[request.type](request, scene, composition), request.type, extras);
}
