import type { MessageRecord, SocialPostRecord, WorkflowNode } from '../types';
import { storyCharactersFromNodes, type StorybookCharacter } from '../storybook/runtime';
import { captureTurnContext } from './contextBuilder';
import { buildLiveContextSource } from './liveContextSource';
import type { TurnContext, TurnScope } from './contracts';
import type { VariableStore } from './variableStore';

/** `activeness` is the character's own Decision-workflow Activeness override (0-4), if the
 * storybook record sets one — `undefined` means "use the route's default" (see
 * decisionSequence.ts's `resolveActiveness`). */
export type DecisionCharacterProfile = { id: string; persona: string; appearance: string; activeness?: number };

export type DecisionSceneContext = {
  situation: string;
  actorId: string;
  actorName: string;
  /** Keyed by display name, since that's how the sequence-decision call and per-block
   * requests refer to characters (the model never sees or invents a raw character id). */
  characters: Record<string, DecisionCharacterProfile>;
  /** Real existing posts pulled straight from message history (`message.socialPost`), in
   * chronological order — this is what makes `social-comment` possible at all: the model
   * only ever names an author it wants to comment on, never a raw postId (see
   * decisionBlocks.ts/decisionAssembler.ts's `latestPostByAuthor`). */
  socialPosts: SocialPostRecord[];
  /** Raw routed bundle, kept alongside the derived `situation` line so a future block builder
   * can pull a specific slice (e.g. `storybookCharacters` for looks) without re-deriving it. */
  routedContext?: DecisionRoutedContext;
};

export type CapturedDecisionContext = { store: VariableStore; context: TurnContext; scene: DecisionSceneContext };

/** Text pulled from a Decision Router node's own input ports (real graph edges, resolved via
 * `executeGraph` against that node's id — see useGraphRun.ts) — the fix for a real gap found
 * this session: without a Decision Router node in the graph, decision-v1's only view of "what's
 * happening right now" was the turn's literal current-input text, nothing else (no history, no
 * event-manager state). Every field here is optional: no Decision Router node in the graph
 * means an entirely empty bundle, and decision-v1 falls back to exactly its old behavior. */
export type DecisionRoutedContext = {
  storybookJson?: string;
  storybookText?: string;
  storybookCharacters?: string;
  history?: string;
  contextCompression?: string;
  lastInput?: string;
  eventManager?: string;
};

function joinLabeled(parts: Array<[label: string, text: string | undefined]>): string {
  return parts.filter(([, text]) => text?.trim()).map(([label, text]) => `${label}: ${text!.trim()}`).join('\n');
}

function personaText(character: StorybookCharacter): string {
  const { role, description, personality, speechStyle } = character.profile;
  return [role && `Role: ${role}`, description, personality && `Personality: ${personality}`, speechStyle && `Speech style: ${speechStyle}`]
    .filter(Boolean).join(' ');
}

/**
 * Captures context exactly like the old planner did (S3's captureTurnContext/
 * buildLiveContextSource, unchanged) and derives the scene shape decision-v1's prompts need:
 * a plain situation description plus, per character, `persona` (behavior/voice — used by every
 * block) and `appearance` (physical description — used only by the `image` block; never mixed
 * with persona, since an image model has no notion of who a named character is beyond what's
 * said explicitly). Appearance comes straight from `character.comfyConfig.appearance`, which
 * `src/nodes/rp-storybook/model.ts` already documents as "a concise visual description for
 * generated images".
 */
export function captureDecisionContext(options: {
  nodes: WorkflowNode[];
  messages: MessageRecord[];
  currentInputText: string;
  primaryCharacterId?: string;
  scope: TurnScope;
  catalogRevision: string;
  instructionsText: string;
  routedContext?: DecisionRoutedContext;
}): CapturedDecisionContext {
  const captured = captureTurnContext({
    scope: options.scope,
    catalogRevision: options.catalogRevision,
    read: () => buildLiveContextSource({
      nodes: options.nodes,
      messages: options.messages,
      currentInputText: options.currentInputText,
      instructions: { general: options.instructionsText },
    }),
  });
  const { context } = captured.view(options.primaryCharacterId);
  const characters = storyCharactersFromNodes(options.nodes);
  const actor = options.primaryCharacterId ? characters.find((character) => character.id === options.primaryCharacterId) : characters[0];
  if (!actor) throw new Error('Decision workflow requires at least one story character.');

  // OC's authoritative facts also include a raw JSON `storybook:<id>`/`banking:<id>` entry per
  // character (contextBuilder.ts) — useful to the old JSON-plan compiler, just noise here, since
  // persona/appearance are already surfaced cleanly above. Keep only genuine narrative facts
  // (e.g. `current-input`, the turn's own message).
  const record = captured.store.read(context.OC, options.scope, 'system');
  const currentInputFacts = record.value.kind === 'facts'
    ? record.value.facts.filter((fact) => !fact.sourceId.startsWith('storybook:') && !fact.sourceId.startsWith('banking:')).map((fact) => fact.text).join('\n')
    : '';
  // With no Decision Router node in the graph, `routedContext` is undefined and `situation`
  // is exactly the old current-input-only text — unchanged behavior for existing routes.
  const situation = options.routedContext
    ? joinLabeled([
        ['Current input', currentInputFacts],
        ['Recent history', options.routedContext.history],
        ['Scheduled events', options.routedContext.eventManager],
        ['Compressed context', options.routedContext.contextCompression],
        ['Last user message', options.routedContext.lastInput],
      ])
    : currentInputFacts;

  const characterProfiles: Record<string, DecisionCharacterProfile> = {};
  for (const character of characters) {
    characterProfiles[character.name] = {
      id: character.id, persona: personaText(character), appearance: character.comfyConfig?.appearance ?? '',
      activeness: character.decisionSettings?.activeness,
    };
  }

  const socialPosts = options.messages.flatMap((message) => message.socialPost ? [message.socialPost] : []);

  return {
    store: captured.store,
    context,
    scene: {
      situation, actorId: actor.id, actorName: actor.name, characters: characterProfiles, socialPosts,
      ...(options.routedContext ? { routedContext: options.routedContext } : {}),
    },
  };
}

/** The post `social-comment` targets when the model names an author: their most recent post,
 * since the model can never reliably produce a real `postId` itself (see file doc comment). */
export function latestPostByAuthor(scene: DecisionSceneContext, authorName: string | undefined): SocialPostRecord | undefined {
  if (!authorName) return undefined;
  const matches = scene.socialPosts.filter((post) => post.author.toLowerCase() === authorName.toLowerCase());
  return matches[matches.length - 1];
}
