import type { EventManagerPromptSettings } from '../../types';
import { fastTaskReasoningStart, fastTaskReasoningEnd } from '../../llm/fastTaskPrompt';

export const eventManagerPromptVariables = [
  '<EventManagerContext>',
  '<ReferenceRpTime>',
  '<ReferenceWallClock>',
  '<AvailableCharacterNames>',
  '<ExistingEvents>',
];

export const defaultEventManagerPromptText = [
  fastTaskReasoningStart,
  '',
  '<EventManagerContext>',
  '',
  'REFERENCE RP TIME: <ReferenceRpTime>',
  'REFERENCE WALL CLOCK: <ReferenceWallClock>',
  'AVAILABLE CHARACTER NAMES: <AvailableCharacterNames>',
  '',
  'EXISTING EVENTS:',
  '<ExistingEvents>',
  '',
  'Maintain scheduled fictional roleplay events. Return one compact JSON object only, without explanation.',
  'Track future or conditional roleplay events such as birthdays, parties, meetings, visits, dates, lessons, deadlines, trips, calls, appointments, reminders, follow-ups, and promises.',
  'Recognize German scheduling words too, such as Geburtstag, Treffen, Termin, Verabredung, Besuch, Feier, Anruf, Reise, and Einladung.',
  'Events do not need an exact time. Use at only when a concrete date/time or relative delay is known. Otherwise use condition and details.',
  'For relative delays such as "in 3 hours", resolve at from REFERENCE RP TIME.',
  'For conditions such as "tell me afterwards by phone", keep at absent and write condition/details.',
  'Choose channel for each event: "chat" means jump/continue the normal RP scene; "phone" means run it through the Phone UI as a phone message.',
  'Use channel:"phone" for text/write/message/call/report-back requests only when both sender and recipient are known characters.',
  'For phone events, phoneFrom and phoneTo must exactly use names from AVAILABLE CHARACTER NAMES. Copy the full character name, including spelling and diacritics.',
  'Never use relationship labels or descriptions as phoneFrom/phoneTo, such as mother, mom, father, sister, brother, boyfriend, girlfriend, teacher, boss, or "Lara\'s Mother". Use the actual character name from AVAILABLE CHARACTER NAMES instead.',
  'If a requested phone recipient is only described by a relationship and no exact character name is available, do not create a phone event. Use channel:"chat" and keep the unresolved recipient in details.',
  'If someone asks a character to ask/tell/message/call another character, store the communication itself as a phone event. Do not convert an unconfirmed question into the final scene event.',
  'For relayed phone events, fill structured fields when known: phoneRequester = who asked, phoneMessenger = who sends the phone message, phoneRecipient = who receives it, phoneAction = only the requested action/task. Do not include "tell Lara to", "message Lara to", or the recipient name inside phoneAction. Do not write the exact phone message; the phone workflow will generate it later.',
  'Example: "Robert asked Sara to tell Lara to get a drink" becomes channel:"phone", phoneFrom:"Sara", phoneTo:"Lara", phoneRequester:"Robert", phoneMessenger:"Sara", phoneRecipient:"Lara", phoneAction:"get a drink".',
  'Example: "Can you ask Anna if I should pick her up tonight?" becomes a phone event where Lara asks Anna, not a pickup scene until Anna confirms.',
  'If someone asks "write/tell/report to me when/after X", store a phone event from the reporting character to the requester with condition/details, not a chat scene.',
  'Use channel:"chat" for meetings, parties, pickups, visits, dates, and scene jumps unless the event explicitly asks for a phone message.',
  'Delete events that already happened, were triggered/run, were fulfilled, were cancelled, or are no longer upcoming relative to REFERENCE RP TIME.',
  'Return only changes. Do not repeat unchanged existing events.',
  'If nothing must change, return exactly {"op":"end"}.',
  'To add events, return {"add":[event]}. To change existing events, return {"update":[{"id":"existing-id",...changedFields}]}. To delete events, return {"delete":["existing-id"]}.',
  'You may combine add, update and delete in one object.',
  'Use local timestamps YYYY-MM-DDTHH:mm for at. If only a date is known, infer a plausible local time from the event.',
  'Each new event object must be compact: {id?,at?,title,condition?,details?,channel?,phoneFrom?,phoneTo?,phoneRequester?,phoneMessenger?,phoneRecipient?,phoneAction?,by?,to?,turn?,note?}.',
  'For update objects, include id and only changed fields.',
  'note must briefly explain the source turn, for example: "Turn 4: Lara invited Alex to her birthday on 2026-01-12."',
  '',
  'RETURN:',
  '{"op":"end"} OR {"add":[event]} OR {"update":[{"id":"existing-id","field":"new value"}]} OR {"delete":["existing-id"]}',
  '',
  fastTaskReasoningEnd,
].join('\n');

export function defaultEventManagerPromptSettings(): EventManagerPromptSettings {
  return { mode: 'default', customText: '' };
}

export function eventManagerPromptSettings(
  value: EventManagerPromptSettings | undefined,
): EventManagerPromptSettings {
  return value?.mode === 'custom'
    ? { mode: 'custom', customText: value.customText ?? '' }
    : defaultEventManagerPromptSettings();
}

export function eventManagerPromptSaveSettings(
  value: EventManagerPromptSettings | undefined,
): EventManagerPromptSettings {
  const settings = eventManagerPromptSettings(value);
  return settings.mode === 'custom' && settings.customText === defaultEventManagerPromptText
    ? defaultEventManagerPromptSettings()
    : settings;
}

export function buildEventManagerPrompt(
  settings: EventManagerPromptSettings | undefined,
  variables: Record<string, string>,
) {
  const template = eventManagerPromptSettings(settings).mode === 'custom'
    ? eventManagerPromptSettings(settings).customText ?? ''
    : defaultEventManagerPromptText;
  return Object.entries(variables)
    .reduce((text, [key, value]) => text.split(`<${key}>`).join(value), template)
    .split('\n')
    .filter((line) => line.trim() || line === '')
    .join('\n')
    .trim();
}
