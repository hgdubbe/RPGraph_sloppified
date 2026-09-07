// Pure and import-free so the editor and Node workflow tools use one format.
export const sectionCategories = {
  task: 'Step description', objective: 'Objective and stakes', tone: 'Tone', wording: 'Vocabulary and word usage',
  perspective: 'Narrative perspective', dialogue: 'Dialogue and voice', npc: 'NPC behavior', knowledge: 'Character knowledge',
  player: 'Player control and agency', focus: 'Scene focus', continuity: 'Continuity and escalation', pacing: 'Pacing and length',
  location: 'Location and communication medium', actors: 'Actor selection', images: 'Image selection and availability',
  imageLookup: 'Gallery lookup', imageCreation: 'Image creation', imageDescription: 'Image description', imageCaption: 'Image captions',
  plan: 'Previous step result', outcomes: 'Planning outcomes and rolls', capabilities: 'Available phone functions',
  format: 'Output format', payload: 'Message payload', app: 'Messenger selection', identities: 'Social accounts and identities',
  privateMessages: 'Private message behavior', commands: 'Command rules', transfers: 'Bank transfers', comments: 'Social comments',
  notes: 'Notes and reminders', assistant: 'In-world AI assistant', conversation: 'Messenger conversations',
  checks: 'Final checks', other: 'Instructions',
} as const;

export type SectionCategory = keyof typeof sectionCategories;
export type PromptField = {
  kind: 'field'; id: string; step: string; role: 'intermediate' | 'response';
  category: SectionCategory; text: string; separator: string;
  title?: string;
};
export type PromptPart = PromptField | { kind: 'marker'; id: string; text: string };
export type PromptSections = { version: 1; before: PromptPart[]; after: PromptPart[] };
export type PromptSide = 'before' | 'after';

function markers() { return /^[ \t]*@step:[ \t]*([A-Za-z0-9_-]+)[ \t]*(?:\r?\n|$)/gim; }

function categoryFor(text: string): SectionCategory {
  const rules: [RegExp, SectionCategory][] = [
    [/^Here is the plan|^@output:/i, 'plan'],
    [/^This is /i, 'task'],
    [/^The tone is|^Fan messages|^Keep the reply/i, 'tone'],
    [/^Accounts (?:and feeds )?are/i, 'knowledge'],
    [/^The request above|^When a conversation origin|^The existing post origin/i, 'continuity'],
    [/^Reply only as/i, 'npc'],
    [/^Answer the newest/i, 'focus'],
    [/^Characters only know/i, 'knowledge'],
    [/^Voice the scene/i, 'dialogue'],
    [/^Image check|^Final reminder, images/i, 'images'],
    [/^@action:.*phone image list/i, 'imageLookup'],
    [/^@action:Create/i, 'imageCreation'],
    [/^@action:Describe/i, 'imageDescription'],
    [/^@action:Update.*caption/i, 'imageCaption'],
    [/^The world is|^(?:Plan for|Carry) stakes/i, 'objective'],
    [/^- NPCs/i, 'npc'],
    [/^One beat, one focus|^Set the beat/i, 'focus'],
    [/^First judge|^Build the escalation|^Check the chat history/i, 'continuity'],
    [/^The beat may|^Escalate up to|^The Text Input contains/i, 'player'],
    [/^Vary the acting/i, 'actors'],
    [/^Before choosing how|^Selection rules|^For (?:Local|Remote) Activity|^When you stay|^An escalation often/i, 'location'],
    [/^Phone functions/i, 'capabilities'],
    [/^Output format for this planning pass/i, 'outcomes'],
    [/^The request includes an \[AVAILABLE/i, 'identities'],
    [/^Private messenger message|^The new post also|^Fan messages/i, 'privateMessages'],
    [/^Replace MessengerAppName|^Use the whatsUpApp/i, 'app'],
    [/^The messenger JSON|^Embed the messenger object|^Write the messenger object/i, 'payload'],
    [/^Commands:|^The messenger actions/i, 'commands'],
    [/Bank_transfer/i, 'transfers'],
    [/post_comment/i, 'comments'],
    [/Create_Note/i, 'notes'],
    [/Simulate_ChatGPD/i, 'assistant'],
    [/Messenger_conversation|Messenger_message/i, 'conversation'],
    [/^Final reminder/i, 'checks'],
    [/^Output format|^How to answer|^[12]\) /i, 'format'],
  ];
  // Final reminders can mention many commands but remain one final check.
  if (/^Final reminder:/i.test(text.trim())) return 'checks';
  return rules.find(([pattern]) => pattern.test(text.trim()))?.[1] ?? 'other';
}

function topic(category: SectionCategory): SectionCategory {
  if (['imageLookup', 'imageCreation', 'imageDescription', 'imageCaption'].includes(category)) return 'images';
  if (['app', 'payload'].includes(category)) return 'format';
  if (['transfers', 'comments', 'notes', 'assistant', 'conversation'].includes(category)) return 'commands';
  return category;
}

export function splitPromptSections(before: string, after: string): PromptSections {
  const names = [...before.matchAll(markers()), ...after.matchAll(markers())]
    .map((match) => match[1].toLowerCase());
  const ordered = [...new Set(names)];
  const response = ordered[ordered.length - 1] ?? 'main';
  function split(text: string, side: PromptSide): PromptPart[] {
    const parts: PromptPart[] = [];
    let step = response;
    function fields(chunk: string) {
      if (!chunk) return;
      const paragraphs = chunk.split(/(\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*)/);
      for (let index = 0; index < paragraphs.length; index += 2) {
        const content = paragraphs[index];
        const separator = paragraphs[index + 1] ?? '';
        if (!content && !separator) continue;
        // Explicit prose boundaries only; never split JSON or infer sentence
        // boundaries from punctuation inside payloads or command templates.
        const pieces = step === response && !content.includes('{')
          ? content.split(/ (?=The tone is |Keep the reply )/)
          : [content];
        pieces.forEach((piece, pieceIndex) => {
          const previous = parts[parts.length - 1];
          const category = topic(categoryFor(piece));
          const tail = pieceIndex === pieces.length - 1 ? separator : ' ';
          // Blank lines stay inside their topic. Unrecognized continuation
          // paragraphs inherit the preceding topic rather than becoming fields.
          if (previous?.kind === 'field' && previous.step === step && (category === 'other' || previous.category === category)) {
            previous.text += previous.separator + piece;
            previous.separator = tail;
          } else parts.push({ kind: 'field', id: `${side}-${parts.length}`, step,
            role: step === response ? 'response' : 'intermediate', category, text: piece, separator: tail });
        });
      }
    }
    let cursor = 0;
    for (const match of text.matchAll(markers())) {
      fields(text.slice(cursor, match.index));
      parts.push({ kind: 'marker', id: `${side}-${parts.length}`, text: match[0] });
      step = match[1].toLowerCase();
      cursor = match.index + match[0].length;
    }
    fields(text.slice(cursor));
    return parts;
  }
  return { version: 1, before: split(before, 'before'), after: split(after, 'after') };
}

export function sectionFields(document: PromptSections): PromptField[] {
  return [...document.before, ...document.after].filter((part): part is PromptField => part.kind === 'field');
}

export function promptSectionSteps(document: PromptSections): [string, PromptField['role']][] {
  const text = assembleSections(document);
  const names = [...new Set([...text.before.matchAll(markers()), ...text.after.matchAll(markers())].map((match) => match[1].toLowerCase()))];
  if (!names.length) names.push('main');
  return names.map((name, index) => [name, index === names.length - 1 ? 'response' : 'intermediate']);
}

export function assembleSections(document: PromptSections) {
  const join = (parts: PromptPart[]) => parts.map((part) => part.text + (part.kind === 'field' ? part.separator : '')).join('');
  return { before: join(document.before), after: join(document.after) };
}

export function validateSections(value: unknown): string[] {
  const isRecord = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.before) || !Array.isArray(value.after)) return ['Invalid prompt sections.'];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const part of [...value.before, ...value.after]) {
    if (!isRecord(part) || typeof part.id !== 'string' || !part.id || typeof part.text !== 'string') {
      errors.push('Invalid prompt section.'); continue;
    }
    if (ids.has(part.id)) errors.push(`Duplicate section ID: ${part.id}.`);
    ids.add(part.id);
    if (part.title !== undefined && (typeof part.title !== 'string' || part.title.length > 160)) errors.push('Section names must be at most 160 characters.');
    if (part.kind === 'marker') {
      if ([...part.text.matchAll(markers())][0]?.[0] !== part.text) errors.push('Invalid step marker.');
    } else if (part.kind !== 'field' || typeof part.step !== 'string' || !/^[a-z0-9_-]+$/.test(part.step) ||
        !['response', 'intermediate'].includes(String(part.role)) || typeof part.category !== 'string' ||
        !Object.prototype.hasOwnProperty.call(sectionCategories, part.category) || typeof part.separator !== 'string' || !/^\s*$/.test(part.separator)) {
      errors.push('Invalid prompt field.');
    } else if (markers().test(part.text)) errors.push('Edit step markers in the raw prompt editor, not inside a field.');
  }
  if (!errors.length) {
    const doc = value as PromptSections;
    const { before, after } = assembleSections(doc);
    const names = [...new Set([...before.matchAll(markers()), ...after.matchAll(markers())].map((match) => match[1].toLowerCase()))];
    const response = names[names.length - 1] ?? 'main';
    for (const side of [doc.before, doc.after]) {
      let step = response;
      for (const part of side) {
        if (part.kind === 'marker') step = [...part.text.matchAll(markers())][0][1].toLowerCase();
        else if (part.step !== step || part.role !== (step === response ? 'response' : 'intermediate')) errors.push('Prompt field execution step does not match its position.');
        else if (part.role !== 'response' && ['tone', 'wording', 'perspective', 'dialogue'].includes(part.category)) errors.push('Writing style belongs in the response step.');
      }
    }
  }
  return errors;
}

export function copySection(document: PromptSections, targetId: string, source: PromptField): PromptSections {
  const target = sectionFields(document).find((field) => field.id === targetId);
  if (!target || target.category !== source.category || target.role !== source.role ||
      (target.role === 'intermediate' && target.step !== source.step)) throw new Error('Choose a matching category and execution role.');
  const next = structuredClone(document);
  sectionFields(next).find((field) => field.id === targetId)!.text = source.text;
  return next;
}

export function mergeSectionWithPrevious(document: PromptSections, fieldId: string): PromptSections {
  const next = structuredClone(document);
  for (const side of [next.before, next.after]) {
    const index = side.findIndex((part) => part.id === fieldId);
    const field = side[index];
    const previous = side[index - 1];
    if (field?.kind !== 'field' || previous?.kind !== 'field' || previous.step !== field.step) continue;
    previous.text += previous.separator + field.text;
    previous.separator = field.separator;
    side.splice(index, 1);
    return next;
  }
  throw new Error('Only adjacent fields in the same execution step and input position can be merged.');
}

export function addSection(document: PromptSections, step: string, category: SectionCategory, side: PromptSide = 'after'): PromptSections {
  const next = structuredClone(document);
  const role = promptSectionSteps(document).find(([name]) => name === step)?.[1];
  if (!role) throw new Error('Unknown execution step.');
  if (role !== 'response' && ['tone', 'wording', 'perspective', 'dialogue'].includes(category)) throw new Error('Writing style belongs in the response step.');
  const insertion = (parts: PromptPart[]) => {
    let index = -1;
    parts.forEach((part, position) => {
      if (part.kind === 'field' ? part.step === step : [...part.text.matchAll(markers())][0]?.[1].toLowerCase() === step) index = position + 1;
    });
    return index;
  };
  let index = insertion(next[side]);
  if (index < 0 && role === 'intermediate') {
    side = side === 'after' ? 'before' : 'after';
    index = insertion(next[side]);
  }
  if (index < 0) index = 0;
  const parts = next[side];
  const previous = parts[index - 1];
  if (previous?.kind === 'field' && !previous.separator) previous.separator = '\n\n';
  if (previous?.kind === 'marker' && !previous.text.endsWith('\n')) previous.text += '\n';
  let number = 0;
  const ids = new Set([...next.before, ...next.after].map((part) => part.id));
  while (ids.has(`added-${number}`)) number++;
  parts.splice(index, 0, { kind: 'field', id: `added-${number}`, step, role, category, text: '', separator: '\n\n' });
  return next;
}
