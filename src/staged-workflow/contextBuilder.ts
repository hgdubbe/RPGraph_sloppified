import type { MessageRecord, WorkflowNode } from '../types';
import { normalizePhoneName } from '../chat/phoneMessages';
import { bankingBalanceForCharacter, bankTransactionsForCharacter } from '../chat/bankTransfers';
import { storyCharactersFromNodes } from '../storybook/runtime';
import { formatChatHistory } from '../workflow/textHelpers';
import { assertReferenceType, type TurnContext, type TurnScope, type VariableRef, type Visibility } from './contracts';
import { VariableStore } from './variableStore';

type ContextFact = { sourceId: string; text: string; visibility: Visibility };
type ContextSource = {
  nodes: WorkflowNode[];
  messages: MessageRecord[];
  latestMessageIds: number[];
  messageVisibility?: Record<number, Visibility>;
  facts?: ContextFact[];
  summaries?: ContextFact[];
  instructions: Record<string, string>;
};
type ContextView = { context: TurnContext; summaries: VariableRef[]; visualContext: VariableRef };

function visibleTo(visibility: Visibility | undefined, viewer: string | undefined) {
  return viewer === undefined || visibility?.kind === 'shared'
    || (visibility?.kind === 'characters' && visibility.characterIds.includes(viewer));
}

/** Capture trusted application state once. This is not an input parser for model output. */
export function captureTurnContext(options: { scope: TurnScope; catalogRevision: string; read: () => ContextSource }) {
  const scope = structuredClone(options.scope);
  const catalogRevision = options.catalogRevision;
  if (!catalogRevision.trim()) throw new Error('A captured catalog revision is required.');
  const source = structuredClone(options.read());
  const characters = storyCharactersFromNodes(source.nodes);
  const byId = new Map(characters.map((character) => [character.id, character]));
  const byName = new Map<string, string[]>();
  for (const character of characters) {
    const name = normalizePhoneName(character.name);
    byName.set(name, [...(byName.get(name) ?? []), character.id]);
  }
  if ([...byName.values()].some((matches) => matches.length !== 1)) {
    throw new Error('Staged phone and banking context requires unique character names.');
  }
  const resolveName = (name: string | undefined) => {
    const matches = byName.get(normalizePhoneName(name ?? ''));
    return matches?.length === 1 ? matches[0] : undefined;
  };
  const latest = new Set(source.latestMessageIds);
  const ids = new Set(source.messages.map((message) => message.id));
  if (ids.size !== source.messages.length || [...latest].some((id) => !ids.has(id))) {
    throw new Error('Context messages need unique identities and existing latest-message references.');
  }
  const store = new VariableStore(scope);
  const views = new Map<string, ContextView>();

  function messageVisible(message: MessageRecord, viewer: string | undefined) {
    if (message.role === 'error' || message.includeInHistory === false) return false;
    if (viewer === undefined) return true;
    const explicit = source.messageVisibility?.[message.id];
    if (explicit && !visibleTo(explicit, viewer)) return false;
    const participates = (from?: string, to?: string) => {
      const sender = resolveName(from);
      const recipient = resolveName(to);
      return !!sender && !!recipient && (sender === viewer || recipient === viewer);
    };
    // Mixed records cannot safely be split by prose. Withhold the whole record
    // if any embedded private exchange is outside this character's knowledge.
    if (message.embeddedPhoneMessages?.some((entry) => !participates(entry.from, entry.to))) return false;
    if (message.socialDirectMessage || message.embeddedSocialMessages?.length || message.createdPhoneNote
      || message.deletedPhoneNote || message.simulatedAiChat) return false;
    if (message.bankTransfer && !participates(message.bankTransfer.from, message.bankTransfer.to)) return false;
    if (message.channel === 'phone' || message.phoneMessage) return participates(message.phoneFrom, message.phoneTo);
    return !!visibleTo(explicit, viewer);
  }

  function view(characterId?: string): ContextView {
    if (characterId !== undefined && !byId.has(characterId)) throw new Error('Unknown character context.');
    const key = JSON.stringify(['context', characterId ?? null]);
    const cached = views.get(key);
    if (cached) return structuredClone(cached);
    const visibility: Visibility = characterId === undefined ? { kind: 'system' } : { kind: 'characters', characterIds: [characterId] };
    const writeFacts = (name: string, facts: Array<{ sourceId: string; text: string }>, provenance: 'observed' | 'authoritative') => store.write({
      id: JSON.stringify([key, name]), value: { kind: 'facts', facts }, inputs: [],
      producer: { kind: 'context', sourceId: catalogRevision }, provenance, visibility, retention: 'turn',
    });
    const messages = source.messages.filter((message) => messageVisible(message, characterId));
    const historyFacts = (isLatest: boolean) => messages.filter((message) => latest.has(message.id) === isLatest).map((message) => ({
      sourceId: `message:${message.id}`,
      text: formatChatHistory([message], false, undefined, undefined, messages),
    }));
    const authoritative = (source.facts ?? []).filter((fact) => visibleTo(fact.visibility, characterId))
      .map(({ sourceId, text }) => ({ sourceId, text }));
    const visualFacts: Array<{ sourceId: string; text: string }> = [];
    for (const character of characters) {
      if (characterId !== undefined && characterId !== character.id) continue;
      visualFacts.push({ sourceId: `appearance:${character.id}`, text: JSON.stringify({
        characterId: character.id, appearance: character.comfyConfig?.appearance ?? '',
      }) });
      authoritative.push({ sourceId: `storybook:${character.id}`, text: JSON.stringify({
        characterId: character.id, profile: character.profile, appearance: character.comfyConfig?.appearance ?? '',
      }) });
      authoritative.push({ sourceId: `banking:${character.id}`, text: JSON.stringify({
        ownerId: character.id, balance: bankingBalanceForCharacter(character, source.messages), currency: 'USD',
        transferMessageIds: bankTransactionsForCharacter(character, source.messages).map(({ message }) => message.id),
      }) });
    }
    const instructions = Object.fromEntries(Object.entries(source.instructions).map(([stageId, text]) => [stageId, store.write({
      id: JSON.stringify([key, 'instruction', stageId]), value: { kind: 'text', text }, inputs: [],
      producer: { kind: 'context', sourceId: `instruction:${stageId}` }, provenance: 'observed', visibility, retention: 'turn',
    })]));
    const summaries = (source.summaries ?? []).flatMap((summary, index) => !visibleTo(summary.visibility, characterId) ? [] : [store.write({
      id: JSON.stringify([key, 'summary', index]), value: { kind: 'text', text: summary.text }, inputs: [],
      producer: { kind: 'context', sourceId: summary.sourceId }, provenance: 'generated', visibility, retention: 'turn',
    })]);
    const result: ContextView = { context: { scope, catalogRevision,
      GH: writeFacts('GH', historyFacts(false), 'observed'), LM: writeFacts('LM', historyFacts(true), 'observed'),
      OC: writeFacts('OC', authoritative, 'authoritative'), instructions,
    }, summaries, visualContext: writeFacts('visualContext', visualFacts, 'authoritative') };
    views.set(key, structuredClone(result));
    return structuredClone(result);
  }

  function visualInputs(characterId: string, draft: VariableRef, scene: VariableRef): VariableRef[] {
    const selected = view(characterId);
    assertReferenceType(draft, 'text');
    assertReferenceType(scene, 'text');
    for (const ref of [draft, scene]) {
      store.read(ref, scope, { characterId });
      if (store.isInvalidated(ref)) throw new Error('Cannot use an invalidated visual input.');
    }
    // Scene instructions carry clothing, setting, framing and intended event;
    // retain the actual associated draft separately instead of substituting a summary.
    return structuredClone([selected.visualContext, scene, draft]);
  }

  return { store, view, visualInputs };
}
