import { describe, expect, it } from 'vitest';
import {
  emptyRpStorybook,
  defaultRpStorybookCharacterComfyConfig,
} from '../nodes/rp-storybook/model';
import { withStorybookCharacterTextField, withStorybookTextField } from './inlineEdits';

describe('storybook inline field edits', () => {
  it('updates top-level and scenario text fields immutably', () => {
    const storybook = {
      ...emptyRpStorybook,
      title: 'Old title',
      scenario: { ...emptyRpStorybook.scenario, summary: 'Old summary' },
    };

    const titled = withStorybookTextField(storybook, 'title', 'New title');
    const summarized = withStorybookTextField(titled, 'scenario.summary', 'New summary');

    expect(storybook.title).toBe('Old title');
    expect(storybook.scenario.summary).toBe('Old summary');
    expect(summarized.title).toBe('New title');
    expect(summarized.scenario.summary).toBe('New summary');
  });

  it('updates visible character text fields including appearance', () => {
    const storybook = {
      ...emptyRpStorybook,
      characters: [{
        id: 'a',
        name: 'A',
        role: '',
        description: '',
        personality: 'Old',
        speechStyle: '',
        images: [],
      }],
    };

    const personality = withStorybookCharacterTextField(storybook, 'a', 'personality', 'New');
    const appearance = withStorybookCharacterTextField(personality, 'a', 'appearance', 'Visual');

    expect(storybook.characters[0]?.personality).toBe('Old');
    expect(appearance.characters[0]?.personality).toBe('New');
    expect(appearance.characters[0]?.comfyConfig).toEqual({
      ...defaultRpStorybookCharacterComfyConfig(),
      appearance: 'Visual',
    });
  });
});
