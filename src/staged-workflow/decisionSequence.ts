import type { DecisionSceneContext } from './decisionSceneContext';

/**
 * The one call that still resembles "planning" — and it's tiny: an ordered list of block-type
 * names, not a structured JSON plan. No refs, no IDs, no dependency wiring; the model only ever
 * says which of a short, fixed vocabulary of things should happen this turn, and in what order.
 *
 * Most types take an optional trailing recipient name; `bank-transfer` also takes an amount
 * after a comma, and `social-post` takes an app name instead of a recipient — see
 * `blockLineHints` below, which drives both the prompt wording and `parseSequence`'s output.
 * `social-comment` names an author, never a raw postId — the model can't invent a real post
 * identity, so it targets "the most recent post by this character" and the backend resolves it
 * from real message history (decisionSceneContext.ts's `latestPostByAuthor`); an author with no
 * post yet just means that block gets skipped with a warning at assembly time.
 * `assistant.chat` is the one family whose recipe step outputs structured `messages`, not text;
 * see decisionBlocks.ts/decisionAssembler.ts for how that's handled.
 */
export type DecisionBlockType =
  | 'narration' | 'whatsup-message' | 'voice-message' | 'image' | 'picture-message' | 'note' | 'bank-transfer'
  | 'social-post' | 'social-comment' | 'assistant-chat';

export const decisionBlockRecipeIds: Record<DecisionBlockType, string> = {
  narration: 'narration.speech',
  'whatsup-message': 'whatsup.message',
  'voice-message': 'voice.message',
  image: 'image.generate',
  'picture-message': 'whatsup.picture-message',
  note: 'note.write',
  'bank-transfer': 'bank.transfer',
  'social-post': 'social.post',
  'social-comment': 'social.comment',
  'assistant-chat': 'assistant.chat',
};

const blockLineHints: Record<DecisionBlockType, string> = {
  narration: 'a short third-person narration beat, no message sent to anyone. Line: "narration".',
  'whatsup-message': 'a WhatsUp text message sent to another character. Line: "whatsup-message: recipient name".',
  'voice-message': 'a spoken WhatsUp voice message sent to another character. Line: "voice-message: recipient name".',
  image: 'a picture the character generates of themselves, owned by them, not sent to anyone. Line: "image".',
  'picture-message': 'a picture the character takes and actually sends to another character over WhatsUp, with a short accompanying message. Use this instead of "image" whenever the picture is meant to be sent to someone, not just kept. Line: "picture-message: recipient name".',
  note: 'a phone Notes entry the character writes for themselves. Line: "note".',
  'bank-transfer': 'a simulated bank transfer to another character. Line: "bank-transfer: recipient name, amount" (amount is a positive number).',
  'social-post': 'a new post to the character\'s own Fotogram or OnlyFriends feed. Line: "social-post" (defaults to Fotogram) or "social-post: onlyfriends" — the trailing word here is the app name (fotogram/onlyfriends only), never a character\'s name; there is no recipient for a public post.',
  'social-comment': 'a comment on another character\'s most recent social post. Line: "social-comment: author name".',
  'assistant-chat': 'a short logged conversation between the character and their phone AI assistant. Line: "assistant-chat".',
};

const allBlockTypes = Object.keys(decisionBlockRecipeIds) as DecisionBlockType[];

/** Narrows the offered vocabulary to whatever the route's recipe allow-list (S9) permits.
 * Reuses that setting as-is — empty/omitted means unrestricted, matching its existing meaning. */
export function availableBlockTypes(allowedRecipeIds?: readonly string[]): DecisionBlockType[] {
  if (!allowedRecipeIds?.length) return allBlockTypes;
  const allowed = new Set(allowedRecipeIds);
  return allBlockTypes.filter((type) => allowed.has(decisionBlockRecipeIds[type]));
}

/** `target`/`detail` are generic trailing slots, not always "recipient"/"amount": `social-post`
 * puts its app choice in `target` (no recipient concept applies); see decisionBlocks.ts and
 * decisionAssembler.ts for how each block type actually interprets them. */
export type DecisionBlockRequest = { type: DecisionBlockType; target?: string; detail?: string };

/**
 * Decision-v1's presentation-style controls (structural-variety punch-list item). Deliberately
 * *descriptive* guidance fed to the model, never a computed probability/RNG that decides for
 * it — the model stays the actual decision-maker; the backend only states a tendency and
 * enforces `maxActionsPerTurn` as a backstop afterward (see runDecisionStagedTurn.ts).
 * `defaultActiveness` is the route's fallback; the actor's own
 * `DecisionCharacterProfile.activeness` (if set) takes priority — see `resolveActiveness`.
 */
export type DecisionComposition = {
  narrativeness: number;
  defaultActiveness: number;
  maxActionsPerTurn: number;
  respectUserAgency: boolean;
  responseLengthText: string;
};

export const defaultDecisionComposition: DecisionComposition = {
  narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 3, respectUserAgency: true, responseLengthText: '',
};

/** Reads the 4 route-level fields off a `WorkflowNodeData`-shaped object without importing that
 * whole type here (keeps this module decoupled from the node-data schema). */
export function resolveDecisionComposition(
  data: {
    decisionNarrativeness?: number; decisionDefaultActiveness?: number;
    decisionMaxActionsPerTurn?: number; decisionRespectUserAgency?: boolean;
  },
  responseLengthText: string,
): DecisionComposition {
  return {
    narrativeness: data.decisionNarrativeness ?? defaultDecisionComposition.narrativeness,
    defaultActiveness: data.decisionDefaultActiveness ?? defaultDecisionComposition.defaultActiveness,
    maxActionsPerTurn: data.decisionMaxActionsPerTurn ?? defaultDecisionComposition.maxActionsPerTurn,
    respectUserAgency: data.decisionRespectUserAgency ?? defaultDecisionComposition.respectUserAgency,
    responseLengthText,
  };
}

/** The acting character's own Activeness override (`decisionSettings.activeness` on their
 * storybook record) wins over the route's default — a personality trait, not a route setting. */
export function resolveActiveness(scene: DecisionSceneContext, composition: DecisionComposition): number {
  return scene.characters[scene.actorName]?.activeness ?? composition.defaultActiveness;
}

const activenessTierPhrases = [
  'this character rarely does more than the one clearly necessary thing this turn; extra actions are unusual for them',
  'this character occasionally follows up with one more action, but usually keeps things simple',
  'this character sometimes follows through with a second action when the moment calls for it, roughly as often as not',
  'this character often follows through with more than one action when a moment calls for it',
  'this character tends to follow through with several actions in a row whenever the moment supports it',
];

export function narrativenessTierPhrase(tier: number, responseLengthText: string): string {
  const phrases = [
    'narration should almost never appear, and when it does, keep it to a single very short beat',
    'narration should appear only occasionally, and stay brief when it does',
    `narration may appear when it helps set the scene, filling some of the space toward the target response length (${responseLengthText}), but shouldn't dominate`,
    `narration should appear often and can run fairly long, filling most of the space up to the target response length (${responseLengthText})`,
    `narration should appear in most turns and can run as long as needed to fill the target response length (${responseLengthText}), carrying much of the scene`,
  ];
  return phrases[Math.min(Math.max(tier, 0), phrases.length - 1)];
}

export function buildSequencePrompt(
  scene: DecisionSceneContext,
  blockTypes: DecisionBlockType[],
  composition: DecisionComposition = defaultDecisionComposition,
  extraGuidance?: string,
): string {
  const activeness = resolveActiveness(scene, composition);
  const activenessPhrase = activenessTierPhrases[Math.min(Math.max(activeness, 0), activenessTierPhrases.length - 1)];
  // Found live against a real model: with no explicit roster, a model asked for a recipient
  // name will sometimes invent one that doesn't exist in the story (e.g. a passing mention in
  // its own narration becomes a "recipient"). An invented name fails real-character lookup at
  // assembly time and the whole block is silently dropped (decisionAssembler.ts) — wasting a
  // real generation call with nothing to show for it. Stating the real roster up front doesn't
  // eliminate hallucination, but removes the single biggest cause of it: not knowing who's real.
  const otherCharacterNames = Object.keys(scene.characters).filter((name) => name !== scene.actorName);
  return [
    `Situation: ${scene.situation}`,
    `Characters who actually exist in this story: ${[scene.actorName, ...otherCharacterNames].join(', ')}. `
      + 'Only name one of these as a recipient/target — never invent a new character.',
    `${scene.actorName} is deciding what to do this turn. Available action types:`,
    ...blockTypes.map((type) => `- ${type}: ${blockLineHints[type]}`),
    'Decide which of these should happen this turn, and in what order. There is no fixed number and no fixed order — it could be just one, or several in any sequence.',
    `Tendency for this character: ${activenessPhrase}. Never produce more than ${composition.maxActionsPerTurn} non-narration action lines this turn, regardless.`,
    `Narration guidance: ${narrativenessTierPhrase(composition.narrativeness, composition.responseLengthText)}.`,
    'A reply in the same medium the user just used is common but not required — choose differently if it fits the character better, '
      + 'or skip responding to it entirely if something else feels more natural for this character right now (distracted, busy with something unrelated, or simply not getting back to it yet).',
    'Reply with exactly one action per line, in the order they should happen, using exactly the line format shown for that type. Nothing else — no numbering, no explanation.',
    ...(extraGuidance?.trim() ? [extraGuidance.trim()] : []),
  ].join('\n');
}

export function parseSequence(text: string, blockTypes: DecisionBlockType[]): DecisionBlockRequest[] {
  const known = new Set<string>(blockTypes);
  const requests: DecisionBlockRequest[] = [];
  for (const rawLine of text.split('\n')) {
    // Strips leading list/quote decoration a real model reliably adds despite instructions
    // not to (found live: a ">markdown blockquote" reply parsed to zero blocks entirely
    // before this, since ">assistant-chat" doesn't match any known type as one raw string).
    const line = rawLine.trim().replace(/^[-*>\d.)\s]+/, '');
    if (!line) continue;
    const [typePart, ...rest] = line.split(':');
    const type = typePart.trim().toLowerCase();
    if (!known.has(type)) continue;
    // Found live: a model sometimes writes the actual message content right after the
    // recipient name instead of stopping there (e.g. `voice-message: Bob "I was looking at
    // your photo..."`), which used to make the whole trailing sentence look like an
    // unrecognized recipient name and drop the block. Dialogue almost always opens with a
    // quote preceded by whitespace — a real name essentially never does — so cut there.
    const trailing = rest.join(':').replace(/\s["'“‘].*$/s, '');
    const [target, detail] = trailing.split(',').map((part) => part.trim()).filter(Boolean);
    requests.push({ type: type as DecisionBlockType, target, detail });
  }
  return requests;
}
