import type { HistoryRpTimePromptSettings } from '../../types';
import { fastTaskReasoningStart, fastTaskReasoningEnd } from '../../llm/fastTaskPrompt';

export const historyRpTimePromptVariables = [
  '<PreviousRpTimeOrNone>',
  '<FallbackDate>',
  '<OpeningSituation>',
  '<PreviousFiveTurns>',
  '<NewTurnJson>',
  '<PendingMessagesJson>',
];

export const defaultHistoryRpTimePromptText = [
  fastTaskReasoningStart,
  '',
  'Maintain a fictional RP clock. Return exactly one compact JSON object and nothing else.',
  'Do not add prose, markdown fences, comments, labels, or a second JSON object.',
  'Use local timestamps YYYY-MM-DDTHH:mm.',
  'Return every pending message id in m as [id,time].',
  'Use the numeric ids from MESSAGES NEEDING TIMESTAMPS JSON exactly; do not invent ids.',
  'The top-level t value is the current RP time after the newest pending message.',
  '',
  'If PREVIOUS CURRENT RP TIME is present, infer elapsed time conservatively from the NEW TURN and never move time backwards.',
  'If PREVIOUS CURRENT RP TIME is (none), establish the initial fictional RP date and time from the OPENING SITUATION and the NEW TURN.',
  'The OPENING SITUATION describes how the story begins. Its date, weekday, season, holiday, and time-of-day clues (e.g. "It\'s Saturday evening") take priority over FALLBACK DATE.',
  'If the user explicitly states a date or time, use it.',
  "Resolve abbreviated years such as '26 as 2026.",
  'If a date is explicit but time is not, infer a plausible local time from the activity.',
  'Infer time from scene clues: university/school pickup is usually daytime or afternoon; commuting is usually morning or afternoon; dinner is evening; sleep/night scenes are late evening or night.',
  'FALLBACK DATE is the real-world date including its weekday. Use it as the date only when the scene is timeless and mentions no date, weekday, season, or holiday.',
  'If the scene states or implies a weekday (e.g. "Saturday evening"), a season, or a holiday that does not match FALLBACK DATE, do not use FALLBACK DATE as-is: pick the nearest date, past or future, whose weekday and season match the scene (e.g. the nearest Saturday, or a June/July date for a summer scene even if FALLBACK DATE is in winter).',
  'The weekday of the chosen date must always match any weekday stated in the scene.',
  'Do not use the wall-clock time as fallback for the hour/minute. The time of day must fit the fictional scene or activity.',
  'When using FALLBACK DATE, keep that date unless actions cross midnight.',
  '',
  'PREVIOUS CURRENT RP TIME:',
  '<PreviousRpTimeOrNone>',
  '',
  'FALLBACK DATE:',
  '<FallbackDate>',
  '',
  'OPENING SITUATION:',
  '<OpeningSituation>',
  '',
  'PREVIOUS FIVE TURNS:',
  '<PreviousFiveTurns>',
  '',
  'NEW TURN JSON:',
  '<NewTurnJson>',
  '',
  'MESSAGES NEEDING TIMESTAMPS JSON:',
  '<PendingMessagesJson>',
  '',
  'VALID EXAMPLE RESPONSE:',
  '{"t":"2026-06-19T14:20","m":[[13,"2026-06-19T14:15"],[14,"2026-06-19T14:20"]]}',
  '',
  'RETURN ONLY THIS SHAPE:',
  '{"t":"YYYY-MM-DDTHH:mm","m":[[123,"YYYY-MM-DDTHH:mm"]]}',
  '',
  fastTaskReasoningEnd,
].join('\n');

export function defaultHistoryRpTimePromptSettings(): HistoryRpTimePromptSettings {
  return { mode: 'default', customText: '' };
}

export function historyRpTimePromptSettings(
  value: HistoryRpTimePromptSettings | undefined,
): HistoryRpTimePromptSettings {
  return value?.mode === 'custom'
    ? { mode: 'custom', customText: value.customText ?? '' }
    : defaultHistoryRpTimePromptSettings();
}

export function historyRpTimePromptSaveSettings(
  value: HistoryRpTimePromptSettings | undefined,
): HistoryRpTimePromptSettings {
  const settings = historyRpTimePromptSettings(value);
  return settings.mode === 'custom' && settings.customText === defaultHistoryRpTimePromptText
    ? defaultHistoryRpTimePromptSettings()
    : settings;
}

export function buildHistoryRpTimePrompt(
  settings: HistoryRpTimePromptSettings | undefined,
  variables: Record<string, string>,
) {
  const normalized = historyRpTimePromptSettings(settings);
  const template = normalized.mode === 'custom'
    ? normalized.customText ?? ''
    : defaultHistoryRpTimePromptText;
  return Object.entries(variables)
    .reduce((text, [key, value]) => text.split(`<${key}>`).join(value), template)
    .trim();
}
