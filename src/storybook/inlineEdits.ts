import {
  defaultRpStorybookCharacterComfyConfig,
  type RpStorybook,
  type RpStorybookCharacter,
} from '../nodes/rp-storybook/model';

export type StorybookTextField =
  | 'title'
  | 'introduction'
  | 'scenario.summary'
  | 'scenario.openingSituation'
  | 'scenario.currentSituation';

export type StorybookCharacterTextField =
  | 'name'
  | 'role'
  | 'description'
  | 'personality'
  | 'speechStyle'
  | 'appearance';

export function withStorybookTextField(
  storybook: RpStorybook,
  field: StorybookTextField,
  value: string,
): RpStorybook {
  switch (field) {
    case 'title':
      return { ...storybook, title: value };
    case 'introduction':
      return { ...storybook, introduction: value };
    case 'scenario.summary':
      return { ...storybook, scenario: { ...storybook.scenario, summary: value } };
    case 'scenario.openingSituation':
      return { ...storybook, scenario: { ...storybook.scenario, openingSituation: value } };
    case 'scenario.currentSituation':
      return { ...storybook, scenario: { ...storybook.scenario, currentSituation: value } };
    default:
      return storybook;
  }
}

function withCharacterTextField(
  character: RpStorybookCharacter,
  field: StorybookCharacterTextField,
  value: string,
): RpStorybookCharacter {
  if (field === 'appearance') {
    return {
      ...character,
      comfyConfig: {
        ...(character.comfyConfig ?? defaultRpStorybookCharacterComfyConfig()),
        appearance: value,
      },
    };
  }
  return { ...character, [field]: value };
}

export function withStorybookCharacterTextField(
  storybook: RpStorybook,
  characterId: string,
  field: StorybookCharacterTextField,
  value: string,
): RpStorybook {
  return {
    ...storybook,
    characters: storybook.characters.map((character) =>
      character.id === characterId
        ? withCharacterTextField(character, field, value)
        : character,
    ),
  };
}
