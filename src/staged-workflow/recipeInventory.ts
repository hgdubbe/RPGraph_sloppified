import type { RecipeDefinition } from './compileTurnPlan';
import type { VariableKind } from './contracts';
import { actionDefinitions, type isActionKey } from '../actions/schema';
import type { PromptCommandId } from '../nodes/shared/promptCommands';

type ActionKey = Parameters<typeof isActionKey>[0] & keyof typeof actionDefinitions;

type StagedRecipeImplementation =
  | {
      status: 'executor-backed';
      executor: 'shared-action-runtime';
      action: ActionKey;
    }
  | {
      status: 'composer-only' | 'compatibility-only' | 'pending-adapter';
      executor:
        | 'deterministic-composer'
        | 'legacy-output-actions'
        | 'legacy-prompt-action'
        | 'direct-app-action'
        | 'not-implemented';
      missing: string[];
    };

export type StagedRecipeInventoryEntry = {
  id: string;
  family:
    | 'narration'
    | 'messenger'
    | 'voice'
    | 'image'
    | 'social'
    | 'notes'
    | 'assistant'
    | 'banking'
    | 'choice'
    | 'ui-control';
  description: string;
  initiators: Array<'model' | 'direct-user'>;
  inputs: Record<string, VariableKind>;
  lockedArguments: Record<string, 'string' | 'number' | 'boolean'>;
  creativeFields: string[];
  result: VariableKind;
  presentation: 'visible-beat' | 'attachment' | 'receipt-only' | 'state-only';
  retryPolicy: 'reconcile-before-retry' | 'regenerate-draft-only' | 'not-enabled';
  implementation: StagedRecipeImplementation;
  advertised: boolean;
  legacySources: string[];
};

function entry(entry: StagedRecipeInventoryEntry) {
  return entry;
}

export const stagedRecipeInventory = [
  entry({
    id: 'narration.speech',
    family: 'narration',
    description: 'Generate a visible narration or character speech beat.',
    initiators: ['model'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: {},
    creativeFields: ['text'],
    result: 'text',
    presentation: 'visible-beat',
    retryPolicy: 'regenerate-draft-only',
    implementation: { status: 'composer-only', executor: 'deterministic-composer', missing: ['S7 deterministic composer'] },
    advertised: true,
    legacySources: ['chat output text'],
  }),
  entry({
    id: 'whatsup.message',
    family: 'messenger',
    description: 'Draft and send one WhatsUp text message.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { recipientId: 'string' },
    creativeFields: ['messageText'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: actionDefinitions['messenger.send'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'messenger.send' },
    advertised: true,
    legacySources: ['actions-v1:messenger.send', 'promptCommand:messenger_message', 'outputActions:phoneMessages'],
  }),
  entry({
    id: 'whatsup.message-with-artifact',
    family: 'messenger',
    description: 'Draft and send one WhatsUp message with an already bound image artifact.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text', attachment: 'artifact' },
    lockedArguments: { recipientId: 'string' },
    creativeFields: ['messageText'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: actionDefinitions['messenger.send'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'messenger.send' },
    advertised: true,
    legacySources: ['actions-v1:messenger.send', 'promptCommand:messenger_message', 'outputActions:phoneMessages'],
  }),
  entry({
    id: 'whatsup.picture-message',
    family: 'messenger',
    // Combines image.generate + whatsup.message-with-artifact into one self-contained recipe
    // (own image prompt, own generated artifact, own accompanying draft, own send) rather than
    // reusing those two recipes across separate instances — decision-v1 has no cross-instance
    // reference mechanism (each block's own small node tree is self-contained by design), so a
    // combined recipe is what actually lets it offer "send a picture to someone" at all. Found
    // live: without this, `image` (owned by the character, never delivered to anyone) was the
    // only picture-related option decision-v1 had.
    description: 'Generate a picture and send it as one WhatsUp message with an accompanying caption.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { ownerId: 'string', recipientId: 'string' },
    creativeFields: ['visualPrompt', 'messageText'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: actionDefinitions['messenger.send'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'messenger.send' },
    advertised: true,
    legacySources: [],
  }),
  entry({
    id: 'messenger.exchange',
    family: 'messenger',
    description: 'Generate a short ordered private exchange across a supported messenger app.',
    initiators: ['model'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { participantAId: 'string', participantBId: 'string' },
    creativeFields: ['messageTexts'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-output-actions', missing: ['per-message staged recipe expansion', 'single-executor receipt binding'] },
    advertised: false,
    legacySources: ['promptCommand:messenger_conversation', 'outputActions:phoneMessages'],
  }),
  entry({
    id: 'voice.message',
    family: 'voice',
    description: 'Draft and send one WhatsUp voice message, rendered as a lazily-synthesized spoken clip.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    // The actual TTS synthesis is lazy/client-side, resolved from the sender's own
    // voice sample and the connected voice provider at playback time (see
    // src/chat/useDialogueVoice.ts) — it is not an action-time argument. Voice delivery
    // is otherwise an ordinary WhatsUp message, so only `recipientId` is locked, matching
    // `whatsup.message`; there is no separate "voice provider" or "direction" argument to
    // lock, unlike the earlier (never-live) design of this entry.
    lockedArguments: { recipientId: 'string' },
    creativeFields: ['messageText'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: actionDefinitions['messenger.send'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'messenger.send' },
    advertised: true,
    legacySources: ['outputActions:phoneMessages.isVoiceMessage', 'promptCommand:messenger_message'],
  }),
  entry({
    id: 'image.lookup',
    family: 'image',
    description: 'Search and select an accessible stored image.',
    initiators: ['model'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { ownerId: 'string' },
    creativeFields: ['query'],
    result: 'artifact',
    presentation: 'attachment',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-prompt-action', missing: ['typed catalog search result', 'artifact binding in staged store'] },
    advertised: false,
    legacySources: ['promptAction:getImageId'],
  }),
  entry({
    id: 'image.display',
    family: 'image',
    description: 'Display one already accessible stored image in the chat timeline.',
    initiators: ['model', 'direct-user'],
    inputs: { artifact: 'artifact' },
    lockedArguments: {},
    creativeFields: [],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-output-actions', missing: ['typed display receipt', 'composer projection'] },
    advertised: false,
    legacySources: ['promptCommand:display_image', 'outputActions:displayImageId'],
  }),
  entry({
    id: 'image.generate',
    family: 'image',
    description: 'Create an image artifact owned by the acting character.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { ownerId: 'string' },
    creativeFields: ['visualPrompt'],
    result: 'artifact',
    presentation: 'attachment',
    retryPolicy: actionDefinitions['image.generate'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'image.generate' },
    advertised: true,
    legacySources: ['actions-v1:image.generate', 'promptAction:createImage'],
  }),
  entry({
    id: 'image.describe',
    family: 'image',
    description: 'Describe an input image as hidden scene metadata.',
    initiators: ['model'],
    inputs: { image: 'artifact', context: 'facts', instructions: 'text' },
    lockedArguments: {},
    creativeFields: ['caption'],
    result: 'text',
    presentation: 'state-only',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-prompt-action', missing: ['typed caption target', 'staged metadata receipt'] },
    advertised: false,
    legacySources: ['promptAction:describeInputImage'],
  }),
  entry({
    id: 'image.caption',
    family: 'image',
    description: 'Create or update a phone image caption decision.',
    initiators: ['model'],
    inputs: { image: 'artifact', context: 'facts', instructions: 'text' },
    lockedArguments: { imageId: 'string' },
    creativeFields: ['caption'],
    result: 'receipt',
    presentation: 'state-only',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-prompt-action', missing: ['typed caption update adapter', 'effect receipt'] },
    advertised: false,
    legacySources: ['promptAction:updatePhoneImageCaption'],
  }),
  entry({
    id: 'social.post',
    family: 'social',
    description: 'Create a new text-only Fotogram or OnlyFriends post from the author\'s own account.',
    initiators: ['model'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { app: 'string' },
    creativeFields: ['caption'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: actionDefinitions['social.post'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'social.post' },
    advertised: true,
    legacySources: ['social output compatibility'],
  }),
  entry({
    id: 'social.comment',
    family: 'social',
    description: 'Append a comment to an existing Fotogram or OnlyFriends post.',
    initiators: ['model'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { app: 'string', postId: 'string' },
    creativeFields: ['commentText'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: actionDefinitions['social.comment'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'social.comment' },
    advertised: true,
    legacySources: ['promptCommand:fotogram_post_comment', 'promptCommand:onlyfriends_post_comment', 'socialOutputCommits'],
  }),
  entry({
    id: 'note.write',
    family: 'notes',
    description: 'Create a phone Notes entry for one character.',
    // Model-authorable, same as every other executor-backed family here — the
    // `actions-v1` note.write action (2026-09-12) proved notes already had a
    // model-authored legacy path too, matching the pattern established for
    // voice/social. Updating an existing note (the `noteId` field on the
    // canonical action) is not exposed here yet: the fixed generate-content
    // step shape below only produces new notes, matching assistant.chat's
    // create-only scope; wiring update support is a separate, later slice.
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { ownerId: 'string' },
    creativeFields: ['title', 'body'],
    result: 'receipt',
    presentation: 'state-only',
    retryPolicy: actionDefinitions['note.write'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'note.write' },
    advertised: true,
    legacySources: ['actions-v1:note.write', 'promptCommand:create_note', 'directAppAction:createdPhoneNote'],
  }),
  entry({
    id: 'assistant.chat',
    family: 'assistant',
    description: 'Simulate and save a character conversation with the phone AI assistant app.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { ownerId: 'string' },
    creativeFields: ['messages'],
    result: 'receipt',
    presentation: 'state-only',
    retryPolicy: 'not-enabled',
    // Model-authorable in actions-v1 since 2026-09-12 (assistant.chat there), same
    // legacy-path story as note.write above. Staged-executor-backed since the same
    // session: the compiler gained a `messages` VariableKind/content-step output
    // (see contracts.ts/compileTurnPlan.ts/scheduler.ts) specifically to carry this
    // family's variable-length (2-8 message) alternating array, so it no longer
    // needs to be forced into the fixed single-text-output shape note.write/
    // bank.transfer use.
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'assistant.chat' },
    advertised: true,
    legacySources: ['actions-v1:assistant.chat', 'promptCommand:simulate_ai_chat', 'directAppAction:simulatedAiChat'],
  }),
  entry({
    id: 'bank.transfer',
    family: 'banking',
    description: 'Commit a simulated bank transfer between accounts.',
    initiators: ['model', 'direct-user'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: { fromId: 'string', toId: 'string', amount: 'number' },
    creativeFields: ['note'],
    result: 'receipt',
    presentation: 'receipt-only',
    retryPolicy: actionDefinitions['bank.transfer'].retryPolicy,
    implementation: { status: 'executor-backed', executor: 'shared-action-runtime', action: 'bank.transfer' },
    advertised: true,
    legacySources: ['actions-v1:bank.transfer', 'promptCommand:bank_transfer', 'directAppAction:bankTransfer', 'outputActions:bankTransfers'],
  }),
  entry({
    id: 'choice.information',
    family: 'choice',
    description: 'Render choices, information boxes, progress bars, or state-derived numeric displays.',
    initiators: ['model'],
    inputs: { context: 'facts', instructions: 'text' },
    lockedArguments: {},
    creativeFields: ['labels', 'explanations'],
    result: 'receipt',
    presentation: 'visible-beat',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-output-actions', missing: ['typed UI result schemas', 'composer projection'] },
    advertised: false,
    legacySources: ['outputActions:choices', 'outputActions:infoBoxes', 'outputActions:progressBars', 'outputActions:contextCapacityBars'],
  }),
  entry({
    id: 'ui.control',
    family: 'ui-control',
    description: 'Apply an explicitly authorized UI or workflow control.',
    initiators: ['direct-user'],
    inputs: { context: 'facts' },
    lockedArguments: { control: 'string' },
    creativeFields: [],
    result: 'receipt',
    presentation: 'state-only',
    retryPolicy: 'not-enabled',
    implementation: { status: 'compatibility-only', executor: 'legacy-output-actions', missing: ['explicit staged authorization boundary', 'typed control executor'] },
    advertised: false,
    legacySources: ['outputActions:controls'],
  }),
] as const satisfies readonly StagedRecipeInventoryEntry[];

export type StagedRecipeId = typeof stagedRecipeInventory[number]['id'];

export function stagedRecipeById(id: string): StagedRecipeInventoryEntry | undefined {
  return stagedRecipeInventory.find((recipe) => recipe.id === id);
}

export function advertisedStagedRecipes(): StagedRecipeInventoryEntry[] {
  return stagedRecipeInventory.filter((recipe) => recipe.advertised).map((recipe) => structuredClone(recipe));
}

function assertCharacter(catalog: { characterIds: string[] }, id: unknown, role: string) {
  if (typeof id !== 'string' || !catalog.characterIds.includes(id)) {
    throw new Error(`Unknown ${role} character.`);
  }
}

const whitelistedActionRecipeIds = new Set<StagedRecipeId>([
  'whatsup.message',
  'whatsup.message-with-artifact',
  'whatsup.picture-message',
  'image.generate',
  'social.post',
  'social.comment',
  'voice.message',
  'note.write',
  'bank.transfer',
  'assistant.chat',
]);

/**
 * S9: a route may restrict which advertised recipes its planner is told about, via an
 * allow-list of ids. Omit/empty means unrestricted (the prior, only, behavior) — this is
 * additive and every existing caller that doesn't pass one is unaffected.
 */
export function stagedRecipeDefinitions(allowedIds?: readonly string[]): RecipeDefinition[] {
  const allowed = allowedIds?.length ? new Set(allowedIds) : undefined;
  return advertisedStagedRecipes().filter((recipe) => !allowed || allowed.has(recipe.id)).map((recipe): RecipeDefinition => {
    if (recipe.id === 'narration.speech') {
      if (recipe.implementation.status !== 'composer-only') {
        throw new Error(`Recipe ${recipe.id} is not backed by the deterministic composer.`);
      }
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'speech', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
        ],
        validate: ({ actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'speaker');
        },
      };
    }
    if (!whitelistedActionRecipeIds.has(recipe.id as StagedRecipeId) || recipe.implementation.status !== 'executor-backed') {
      throw new Error(`Recipe ${recipe.id} is not backed by the shared staged executor.`);
    }
    if (recipe.id === 'image.generate') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'prompt', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'artifact', kind: 'execute-action', output: 'artifact', inputs: ['prompt'], generations: 1 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'acting');
          assertCharacter(catalog, args.ownerId, 'owner');
          if (args.ownerId !== actorId) {
            throw new Error('Generated image owner must match the acting character until cross-owner policy exists.');
          }
        },
      };
    }
    if (recipe.id === 'whatsup.picture-message') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'prompt', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'artifact', kind: 'execute-action', output: 'artifact', inputs: ['prompt'], generations: 1 },
          // References 'prompt' (the drafted image description), not 'artifact' (the binary) —
          // decision-v1 already drafted this text using that same description as context, so
          // the compiled stage's own declared dependency matches what actually informed it.
          { key: 'draft', kind: 'generate-content', output: 'text', inputs: ['context', 'prompt'], instruction: 'instructions', generations: 0 },
          { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['draft', 'artifact'], generations: 0 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'sending');
          assertCharacter(catalog, args.ownerId, 'owner');
          assertCharacter(catalog, args.recipientId, 'recipient');
          if (args.ownerId !== actorId) {
            throw new Error('Generated image owner must match the acting character until cross-owner policy exists.');
          }
          if (args.recipientId === actorId) {
            throw new Error('WhatsUp sender and recipient must differ.');
          }
        },
      };
    }
    if (recipe.id === 'social.post') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'draft', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['draft'], generations: 0 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'posting');
          if (args.app !== 'fotogram' && args.app !== 'onlyfriends') throw new Error('Social app must be fotogram or onlyfriends.');
        },
      };
    }
    if (recipe.id === 'note.write') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'title', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'body', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['title', 'body'], generations: 0 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'writing');
          assertCharacter(catalog, args.ownerId, 'owner');
          if (args.ownerId !== actorId) {
            throw new Error('A character can only write to their own Notes app.');
          }
        },
      };
    }
    if (recipe.id === 'assistant.chat') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'messages', kind: 'generate-content', output: 'messages', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['messages'], generations: 0 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'chatting');
          assertCharacter(catalog, args.ownerId, 'owner');
          if (args.ownerId !== actorId) {
            throw new Error('A character can only use their own assistant app.');
          }
        },
      };
    }
    if (recipe.id === 'bank.transfer') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'note', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['note'], generations: 0 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'sending');
          assertCharacter(catalog, args.fromId, 'sender');
          assertCharacter(catalog, args.toId, 'recipient');
          if (args.fromId !== actorId) {
            throw new Error('A character can only send from their own account.');
          }
          if (args.fromId === args.toId) {
            throw new Error('Bank transfer sender and recipient must differ.');
          }
          if (typeof args.amount !== 'number' || !Number.isFinite(args.amount) || args.amount <= 0) {
            throw new Error('Bank transfer amount must be a positive number.');
          }
        },
      };
    }
    if (recipe.id === 'social.comment') {
      return {
        id: recipe.id,
        description: recipe.description,
        initiators: [...recipe.initiators],
        inputs: { ...recipe.inputs },
        arguments: { ...recipe.lockedArguments },
        retryPolicy: recipe.retryPolicy,
        steps: [
          { key: 'draft', kind: 'generate-content', output: 'text', inputs: ['context'], instruction: 'instructions', generations: 0 },
          { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: ['draft'], generations: 0 },
        ],
        validate: ({ args, actorId, catalog }) => {
          assertCharacter(catalog, actorId, 'commenting');
          if (args.app !== 'fotogram' && args.app !== 'onlyfriends') throw new Error('Social app must be fotogram or onlyfriends.');
          if (typeof args.postId !== 'string' || !args.postId.trim()) throw new Error('A social comment must reference an existing post.');
        },
      };
    }
    const withArtifact = recipe.id === 'whatsup.message-with-artifact';
    return {
      id: recipe.id,
      description: recipe.description,
      initiators: [...recipe.initiators],
      inputs: { ...recipe.inputs },
      arguments: { ...recipe.lockedArguments },
      retryPolicy: recipe.retryPolicy,
      steps: [
        { key: 'draft', kind: 'generate-content', output: 'text', inputs: withArtifact ? ['context', 'attachment'] : ['context'], instruction: 'instructions', generations: 0 },
        { key: 'receipt', kind: 'execute-action', output: 'receipt', inputs: withArtifact ? ['draft', 'attachment'] : ['draft'], generations: 0 },
      ],
      validate: ({ args, actorId, catalog }) => {
        assertCharacter(catalog, actorId, 'sender');
        assertCharacter(catalog, args.recipientId, 'recipient');
        if (args.recipientId === actorId) {
          throw new Error('WhatsUp sender and recipient must differ.');
        }
      },
    };
  });
}

export function legacyPromptCommandCoverage(): Record<PromptCommandId, StagedRecipeId[]> {
  const coverage = {
    bank_transfer: ['bank.transfer'],
    create_note: ['note.write'],
    simulate_ai_chat: ['assistant.chat'],
    messenger_message: ['whatsup.message', 'whatsup.message-with-artifact', 'voice.message'],
    messenger_conversation: ['messenger.exchange'],
    display_image: ['image.display'],
    fotogram_post_comment: ['social.comment'],
    onlyfriends_post_comment: ['social.comment'],
  } satisfies Record<PromptCommandId, StagedRecipeId[]>;
  return structuredClone(coverage);
}
