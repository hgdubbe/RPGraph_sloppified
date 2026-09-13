import { describe, expect, it } from 'vitest';
import {
  defaultStagedInstructionsSettings,
  defaultStagedInstructionsText,
  resolveStagedInstructionsText,
  stagedInstructionsSaveSettings,
  stagedInstructionsSettings,
} from './stagedInstructionsPrompt';

describe('stagedInstructionsSettings', () => {
  it('defaults undefined and non-custom values to mode default with empty customText', () => {
    expect(stagedInstructionsSettings(undefined)).toEqual(defaultStagedInstructionsSettings());
    expect(stagedInstructionsSettings({ mode: 'default' })).toEqual(defaultStagedInstructionsSettings());
  });

  it('normalizes a custom value, defaulting a missing customText to empty string', () => {
    expect(stagedInstructionsSettings({ mode: 'custom', customText: 'Be terse.' }))
      .toEqual({ mode: 'custom', customText: 'Be terse.' });
    expect(stagedInstructionsSettings({ mode: 'custom' })).toEqual({ mode: 'custom', customText: '' });
  });
});

describe('stagedInstructionsSaveSettings', () => {
  it('collapses a custom value that exactly matches the default text back to default', () => {
    expect(stagedInstructionsSaveSettings({ mode: 'custom', customText: defaultStagedInstructionsText }))
      .toEqual(defaultStagedInstructionsSettings());
  });

  it('keeps a genuinely custom value as custom', () => {
    expect(stagedInstructionsSaveSettings({ mode: 'custom', customText: 'Be terse.' }))
      .toEqual({ mode: 'custom', customText: 'Be terse.' });
  });
});

describe('resolveStagedInstructionsText', () => {
  it('resolves the default text when unset or in default mode', () => {
    expect(resolveStagedInstructionsText(undefined)).toBe(defaultStagedInstructionsText);
    expect(resolveStagedInstructionsText({ mode: 'default' })).toBe(defaultStagedInstructionsText);
  });

  it('resolves the authored custom text', () => {
    expect(resolveStagedInstructionsText({ mode: 'custom', customText: 'Keep it terse.' })).toBe('Keep it terse.');
  });
});
