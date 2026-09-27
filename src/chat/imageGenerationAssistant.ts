import { imageReferencePrompt, type ImageGenerationReference } from '../images/references';
export type ImageGenerationAssistantMessage = {
  role: 'user' | 'assistant' | 'error' | 'reference';
  text: string;
  reference?: ImageGenerationReference;
};

export type ImageAssistantModelState = 'unknown' | 'loading' | 'loaded' | 'unloading' | 'unloaded';

export type ImageGenerationAssistantResult = {
  reply: string;
  prompt: string | null;
  settings: ImageGenerationSettings | null;
  imageDescription: string | null;
};

export type ImageGenerationSettings = {
  width: number;
  height: number;
  characterLora: string;
  aspectRatio?: string;
};

type ImageGenerationCharacter = {
  name: string;
  profile: {
    description: string;
    personality: string;
    speechStyle: string;
  };
  comfyConfig?: {
    appearance: string;
    loraName: string;
  };
};

export function imageGenerationCharacterContext(characters: ImageGenerationCharacter[]) {
  return characters.map((character, index) => [
    `Character ${index + 1}: ${character.name.trim() || 'Unnamed'}`,
    `Description: ${character.profile.description.trim() || '(none)'}`,
    `Personality: ${character.profile.personality.trim() || '(none)'}`,
    `Speech Style: ${character.profile.speechStyle.trim() || '(none)'}`,
    `Character Appearance: ${character.comfyConfig?.appearance.trim() || '(none)'}`,
    `Character LoRA: ${character.comfyConfig?.loraName.trim() || '(none)'}`,
  ].join('\n')).join('\n\n');
}

const commonImageInstructions = [
  'You are the image-generation prompt assistant for an RP game inside RPGraph.',
  'Your job is to create and refine one complete image prompt, its generation settings, and the description of the currently selected generated image.',
  'You receive the last four RP turns as story context. Use them to understand references, relationships, locations, actions, mood, and what is currently happening.',
  'When attached, you can see the currently selected generated image. Treat it as the image the user refers to when they mention this image, the current image, or visible details.',
  'The scene does not have to show a Storybook character. Users may also request photos a character would take: their pet or another animal, an outdoor shot such as the house, garden, or street, an interior shot such as a decorated room, an object, food, or a pure mood or landscape scene.',
  'Use the character database and recent story context as facts. Do not invent conflicting identity or appearance details.',
  'The current image prompt, settings, and image description are editable by the user and are the source of truth.',
  'Keep prompt editing and selected-image description as two separate tasks.',
  'If the user asks to describe, identify, analyze, or caption the selected/current image, inspect the attached image in the recent story context. Return prompt and settings as null, and update only imageDescription. Do not interpret this as a request to describe or rewrite the image-generation prompt.',
  'If the user asks to create an image prompt or change what a future generated image should show, update prompt as needed and leave imageDescription null unless they explicitly ask to correct the selected image description too.',
  'When the user requests an image or a visual change, return a complete updated prompt that preserves all existing details not affected by the request.',
  'Do not merely append contradictory instructions. Integrate the requested change cleanly.',
  'Write the final image prompt as one frozen visual snapshot. Do not advance the story, describe what happens next, or combine earlier and later states of the scene.',
  'Use direct, natural, factual English. Use only standard ASCII characters and normal punctuation in the final image prompt. Do not use Markdown, decorative symbols, poetic narration, metaphors, or generic quality tags.',
  'Include only details that can be shown in a single still image. Exclude thoughts, dialogue, sounds, smells, tastes, memories, intentions, relationships, backstory, and explanations. Express mood only through visible details such as posture, facial expression, lighting, composition, and environment.',
  'Use the most recent established visible state of every person, garment, object, and location. Track clothing that was put on, removed, opened, closed, raised, lowered, loosened, or covered. Mention only clothing and accessories that are currently visible, and omit anything fully concealed or outside the frame.',
  'Describe objects only in their current visible state. Do not refer to their earlier state, explain how they changed, or describe absent or hidden elements with negative phrases such as "no visible" or "no other".',
  'Do not use Storybook-only character names, private fictional place names, or other story-specific proper nouns in the final image prompt. Translate them into clear visual descriptions such as "the young woman", "the seated man", or "the woman on the left". Names may still be used in the assistant reply, internal settings, and imageDescription. Keep widely recognized real or fictional names only when the user explicitly requests that known subject or setting.',
  'For scenes with multiple people, describe each person separately and distinguish them through position, appearance, clothing, hairstyle, pose, and visible action. Avoid ambiguous pronouns. When a visual feature is important for distinguishing one person, state the corresponding visible feature for the others when useful.',
  'Write rich, thorough image prompts of roughly 80 to 120 words. Describe subjects and their visible appearance first, then their positions, poses, expressions, and interaction, followed by the setting and background objects, camera angle and composition, lighting and time of day, and the visible atmosphere.',
  'Prefer specific visual descriptions over generic wording. Every added detail must stay consistent with the character database and the recent story context.',
  'When the user asks a general question or asks for advice without requesting a prompt change, set prompt to null.',
  'Only return imageDescription when describing or correcting the selected image. Write a concise 20 to 40 word scene description.',
  'When describing the selected image, read it against the last four RP turns: when visible people, places, or actions plausibly match story characters or events, name them accordingly instead of describing them generically.',
  'Keep reply brief and conversational. Summarize what changed without repeating the image prompt.',
  'Return only valid JSON with all four fields. Start from this unchanged result and replace only fields that changed:',
  '{"reply":"Short chat response","prompt":null,"settings":null,"imageDescription":null}',
].join('\n');
const comfyImageInstructions = [
  'You receive a Storybook character database with each character\'s description, personality, speech style, visual appearance, and optional exact Character LoRA filename.',
  'The image settings support at most one Character LoRA per image.',
  'Compare the model family in the exact LoRA filename with the supplied diffusion model (or workflow name if the model is unknown). Only matching, identifiable model families can activate automatically. Missing or different model names leave the LoRA selected but disabled. Explain this in reply. A missing Character LoRA slot also prevents activation. Manual user activation can override a model warning, but cannot create a slot.',
  'When a selected LoRA cannot activate, describe the character fully from their text appearance; do not rely on the LoRA for identity. Still return the exact selected filename in characterLora so the UI can display its warning.',
  'When a requested character has an available LoRA, use its exact filename in characterLora. If that LoRA can activate, it carries that character\'s look, so keep their visual description short: state pose, expression, clothing, and action, but do not restate face, hair, or body details from the database.',
  'When a requested character has no LoRA, their appearance comes entirely from the prompt text: describe them in full visual detail from the character database, including face, hair, body, and typical style.',
  'A LoRA character and non-LoRA characters may appear together in one scene: describe the LoRA character briefly and the non-LoRA characters in detail.',
  'Never use two Character LoRAs. If the user requests two or more characters that each have a LoRA, set characterLora to the one whose LoRA fits the request best, describe the remaining LoRA characters from their text appearance only, and clearly warn in reply that only one Character LoRA is possible per image.',
  'If none of the requested characters has a defined LoRA, describe all of them from their text-based appearance information and leave characterLora empty.',
  'Only return settings when the user requests a settings change or when the correct Character LoRA selection must change. Preserve unchanged settings.',
  'width and height must be whole pixels from 64 through 4096. Use the requested aspect ratio and approximately requested pixel count.',
  'characterLora must be one exact available Character LoRA filename or an empty string. Other provider LoRA slots are outside these settings and remain unchanged.',
  'A changed settings value must be {"width":1024,"height":1024,"characterLora":"exact filename or empty"}.',
].join('\n');

export function imageAssistantInstructions(usesComfy: boolean, supportsReferences = false) {
  return [commonImageInstructions, usesComfy ? comfyImageInstructions : [
    'API image generation: always return settings as null. Do not include pixel dimensions or technical rendering settings in the prompt.',
    'Describe composition using an aspect ratio. Default to portrait 3:4 unless the user requests another format. Include the chosen format explicitly in the JSON prompt field, for example: Portrait composition, aspect ratio 3:4.',
    'Without references, describe visible subjects fully from the character database and story context.',
  ].join('\n'), ...(supportsReferences ? [
    'REFERENCE EDITING: When references are selected, the JSON prompt field itself MUST refer explicitly to the relevant Image 1, Image 2, or Image 3. Mentioning them only in reply is insufficient.',
    'Only when references are selected, write an editing instruction, not a replacement standalone scene description. Specify which image supplies each identity, pose, setting, or style, which details to preserve, and the requested changes. Do not replace reference identity with an invented generic person.',
    'For reference editing, preserving the requested reference details takes priority over the standalone prompt length and character-description rules. Without selected references, write a standalone scene prompt.',
    'Example prompt: Portrait composition, aspect ratio 3:4. Use the woman from Image 1, preserving her face and hair. Place her in the seated pose from Image 2, with the cat from Image 3 on her lap.',
  ] : [])].join('\n');
}

export const imageGenerationAssistantInstructions = imageAssistantInstructions(true);

function assistantConversation(messages: ImageGenerationAssistantMessage[]) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
    .join('\n');
}

export function imageGenerationAssistantPrompt(
  currentPrompt: string,
  currentSettings: ImageGenerationSettings,
  currentImageDescription: string,
  availableCharacterLoras: string[],
  characterContext: string,
  chatHistoryContext: string,
  messages: ImageGenerationAssistantMessage[],
  userMessage: string,
  describeImage = false,
  describeFromPromptOnly = false,
  supportsCharacterLora = true,
  referenceImages: ImageGenerationReference[] = [],
  supportsReferences = !supportsCharacterLora,
  modelContext = '',
) {
  return [
    imageAssistantInstructions(supportsCharacterLora, supportsReferences),
    modelContext,
    ...(describeImage
      ? [describeFromPromptOnly
        ? 'The Describe Image button was pressed, but the selected assistant provider cannot see images. Write the description from the current image prompt below and the last four RP turns instead: infer matching characters, places, and events from the prompt text. Do not claim to have viewed the image. Return exactly this update shape: {"reply":"Short confirmation","prompt":null,"settings":null,"imageDescription":"20 to 40 word description"}.'
        : 'The Describe Image button was pressed. This is strictly a selected-image description task, not a prompt-editing task. Inspect the attached image, interpret it in the context of the last four RP turns, and name matching characters, places, and events. Return exactly this update shape: {"reply":"Short confirmation","prompt":null,"settings":null,"imageDescription":"20 to 40 word description"}.']
      : []),
    '',
    ...(supportsReferences ? [imageReferencePrompt(referenceImages)] : []),
    '',
    `Current image prompt:\n${currentPrompt.trim() || '(empty)'}`,
    '',
    ...(supportsCharacterLora ? [`Current image settings:\n${JSON.stringify(currentSettings, null, 2)}`] : [`Output format: ${currentSettings.aspectRatio || '3:4'}. Include this aspect ratio in the generation prompt.`]),
    '',
    ...(supportsCharacterLora ? [`Available Character LoRAs (character name: exact filename):\n${availableCharacterLoras.join('\n') || '(none)'}`] : []),
    '',
    `Storybook Characters:\n${(supportsCharacterLora ? characterContext : characterContext.split('\n').filter((line) => !line.includes('LoRA')).join('\n')) || '(none)'}`,
    '',
    `Last Four RP Turns:\n${chatHistoryContext || '(none)'}`,
    '',
    `Current selected image description:\n${currentImageDescription.trim() || '(none)'}`,
    '',
    `Earlier conversation:\n${assistantConversation(messages) || '(none)'}`,
    '',
    `New user message:\n${userMessage}`,
  ].join('\n');
}

export function parseImageGenerationAssistantResult(
  text: string,
  describeImage = false,
): ImageGenerationAssistantResult {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  let value: unknown;
  try {
    value = JSON.parse(fenced);
  } catch {
    throw new Error('The assistant returned an invalid response. Please try again.');
  }
  if (!value || typeof value !== 'object') {
    throw new Error('The assistant response is missing its result.');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.reply !== 'string' || !record.reply.trim()) {
    throw new Error('The assistant response is missing its chat reply.');
  }
  if (record.prompt !== undefined && record.prompt !== null && typeof record.prompt !== 'string') {
    throw new Error('The assistant returned an invalid image prompt.');
  }
  let settings: ImageGenerationSettings | null = null;
  if (record.settings !== undefined && record.settings !== null) {
    if (!record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings)) {
      throw new Error('The assistant returned invalid image settings.');
    }
    const candidate = record.settings as Record<string, unknown>;
    if (
      typeof candidate.width !== 'number' || !Number.isInteger(candidate.width) || candidate.width < 64 || candidate.width > 4096 ||
      typeof candidate.height !== 'number' || !Number.isInteger(candidate.height) || candidate.height < 64 || candidate.height > 4096 ||
      typeof candidate.characterLora !== 'string'
    ) {
      throw new Error('The assistant returned invalid image settings.');
    }
    settings = {
      width: candidate.width,
      height: candidate.height,
      characterLora: candidate.characterLora.trim(),
    };
  }
  if (
    record.imageDescription !== undefined &&
    record.imageDescription !== null &&
    typeof record.imageDescription !== 'string'
  ) {
    throw new Error('The assistant returned an invalid image description.');
  }
  const result: ImageGenerationAssistantResult = {
    reply: record.reply.trim(),
    prompt: typeof record.prompt === 'string' ? record.prompt.trim() : null,
    settings,
    imageDescription: typeof record.imageDescription === 'string' ? record.imageDescription.trim() : null,
  };
  if (describeImage) {
    if (!result.imageDescription) {
      throw new Error('The assistant did not return an image description. Please try again.');
    }
    return {
      ...result,
      prompt: null,
      settings: null,
    };
  }
  return result;
}
