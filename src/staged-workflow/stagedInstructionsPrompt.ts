import type { StagedInstructionsSettings } from '../types';

export const defaultStagedInstructionsText =
  'Continue the roleplay scene naturally, respecting established tone and character voice.';

export function defaultStagedInstructionsSettings(): StagedInstructionsSettings {
  return { mode: 'default', customText: '' };
}

export function stagedInstructionsSettings(
  value: StagedInstructionsSettings | undefined,
): StagedInstructionsSettings {
  return value?.mode === 'custom'
    ? { mode: 'custom', customText: value.customText ?? '' }
    : defaultStagedInstructionsSettings();
}

export function stagedInstructionsSaveSettings(
  value: StagedInstructionsSettings | undefined,
): StagedInstructionsSettings {
  const settings = stagedInstructionsSettings(value);
  return settings.mode === 'custom' && settings.customText === defaultStagedInstructionsText
    ? defaultStagedInstructionsSettings()
    : settings;
}

/** The plain instruction text a staged turn should actually use, resolving `default`/`custom`. */
export function resolveStagedInstructionsText(value: StagedInstructionsSettings | undefined): string {
  const normalized = stagedInstructionsSettings(value);
  return normalized.mode === 'custom' ? normalized.customText ?? '' : defaultStagedInstructionsText;
}
