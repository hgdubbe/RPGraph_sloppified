import { describe, expect, it, vi } from 'vitest';
import type { MessageRecord, WorkflowNode } from '../types';
import { starterRpStorybook, rpStorybookJsonText } from '../nodes/rp-storybook/model';
import { storyCharactersFromNodes } from '../storybook/runtime';
import { captureTurnContext } from './contextBuilder';
import type { Visibility } from './contracts';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };
function fixture() {
  const story = structuredClone(starterRpStorybook);
  story.characters = ['Alice', 'Bob', 'Clara'].map((name) => ({
    ...structuredClone(story.characters[0]), id: name.toLowerCase(), name,
    banking: { startBalance: 100, fixedExpenses: [] },
    comfyConfig: { appearance: `${name} appearance`, loraName: '' }, images: [],
  }));
  const nodes = [{ id: 'story', data: { nodeType: 'rp-storybook-editor', storybookJson: rpStorybookJsonText(story) } }] as WorkflowNode[];
  const characters = storyCharactersFromNodes(nodes);
  const messages: MessageRecord[] = [
    { id: 1, role: 'output', channel: 'phone', phoneFrom: 'Alice', phoneTo: 'Bob', originalText: 'Private joke', contextComment: 'Sarcastic' },
    { id: 2, role: 'output', originalText: 'Unclassified secret' },
    { id: 3, role: 'output', originalText: 'Everyone enters the room' },
    { id: 4, role: 'output', originalText: 'Transfer', bankTransfer: { from: 'Alice', to: 'Bob', amount: 25 } },
    { id: 5, role: 'user', channel: 'phone', phoneFrom: 'Bob', phoneTo: 'Alice', originalText: 'Latest private input' },
  ];
  const read = vi.fn(() => ({ nodes, messages, latestMessageIds: [5],
    messageVisibility: { 3: { kind: 'shared' } as Visibility },
    summaries: [{ sourceId: 'summary-1', text: 'Maybe Clara is jealous', visibility: { kind: 'shared' } as Visibility }],
    instructions: { writer: 'Keep it brief' },
  }));
  const capture = () => captureTurnContext({ scope, catalogRevision: 'catalog-1', read });
  return { capture, read, nodes, messages, characters };
}

describe('staged context capture', () => {
  it('filters private phone history and latest input before exposing a character view', () => {
    const f = fixture();
    const captured = f.capture();
    const alice = captured.view(f.characters[0].id);
    const clara = captured.view(f.characters[2].id);
    expect(JSON.stringify(captured.store.read(alice.context.GH, scope, { characterId: f.characters[0].id }).value)).toContain('Private joke');
    const visible = JSON.stringify(captured.store.read(clara.context.GH, scope, { characterId: f.characters[2].id }).value);
    expect(visible).toContain('Everyone enters');
    expect(visible).not.toMatch(/Private joke|Sarcastic|Unclassified secret|Transfer/);
    expect(captured.store.read(clara.context.LM, scope, { characterId: f.characters[2].id }).value).toEqual({ kind: 'facts', facts: [] });
    expect(() => captured.store.read(alice.context.GH, scope, { characterId: f.characters[2].id })).toThrow(/visible/);
  });

  it('captures once and keeps both source mutations and returned-reference mutations detached', () => {
    const f = fixture();
    const captured = f.capture();
    f.messages[0].originalText = 'Changed after capture';
    f.nodes[0].data.storybookJson = '{}';
    const first = captured.view(f.characters[0].id);
    first.context.GH.scope.turnId = 'tampered';
    const again = captured.view(f.characters[0].id);
    expect(again.context.GH.scope).toEqual(scope);
    expect(JSON.stringify(captured.store.read(again.context.GH, scope, 'system').value)).toContain('Private joke');
    expect(f.read).toHaveBeenCalledTimes(1);
  });

  it('keeps actual balances and appearance authoritative, with speculative summaries separate', () => {
    const f = fixture();
    const captured = f.capture();
    const view = captured.view(f.characters[0].id);
    const overall = captured.store.read(view.context.OC, scope, 'system');
    expect(overall.provenance).toBe('authoritative');
    const facts = JSON.stringify(overall.value);
    expect(facts).toContain('Alice appearance');
    expect(facts).toContain('75');
    expect(facts).not.toMatch(/Clara appearance|jealous/);
    expect(captured.store.read(view.summaries[0], scope, 'system').provenance).toBe('generated');
    expect(captured.store.read(view.context.GH, scope, 'system').provenance).toBe('observed');
  });

  it('fails closed for unknown names and mixed private narration even when marked shared', () => {
    const f = fixture();
    f.messages[0].phoneFrom = 'Unknown';
    f.messages[2].embeddedPhoneMessages = [{ phoneMessageId: 1, from: 'Alice', to: 'Bob', message: 'Private inline message' }];
    const captured = f.capture();
    const clara = captured.view(f.characters[2].id);
    expect(JSON.stringify(captured.store.read(clara.context.GH, scope, 'system').value)).not.toMatch(/Private|Everyone enters/);
    expect(() => captured.view('unknown')).toThrow(/Unknown character/);
  });

  it('selects exact visible visual draft revisions and rejects invalidated or private inputs', () => {
    const f = fixture();
    const captured = f.capture();
    const owner = f.characters[0].id;
    const view = captured.view(owner);
    const write = (text: string) => captured.store.write({ id: 'draft', value: { kind: 'text', text },
      producer: { kind: 'stage', stageId: 'writer' }, inputs: [view.context.LM],
      provenance: 'generated', visibility: { kind: 'characters', characterIds: [owner] }, retention: 'draft' });
    const draft = write('Alice waves in a red coat');
    const scene = captured.store.write({ id: 'scene', value: { kind: 'text', text: 'Red coat; station; wide shot; greeting Bob' },
      producer: { kind: 'context', sourceId: 'user:scene' }, inputs: [], provenance: 'observed',
      visibility: { kind: 'characters', characterIds: [owner] }, retention: 'turn' });
    expect(captured.visualInputs(owner, draft, scene)).toEqual([view.visualContext, scene, draft]);
    const visual = JSON.stringify(captured.store.read(view.visualContext, scope, 'system').value);
    expect(visual).toContain('Alice appearance');
    expect(visual).not.toMatch(/balance|personality|banking/);
    expect(() => captured.visualInputs(f.characters[2].id, draft, scene)).toThrow(/visible/);
    const dependent = captured.store.write({ id: 'visual', value: { kind: 'text', text: 'Red coat, wide shot' },
      producer: { kind: 'stage', stageId: 'visual' }, inputs: [draft], provenance: 'generated',
      visibility: { kind: 'characters', characterIds: [owner] }, retention: 'draft' });
    write('Alice waves in a blue coat');
    expect(() => captured.visualInputs(owner, dependent, scene)).toThrow(/invalidated/);
  });

  it('rejects ambiguous name-keyed casts before deriving phone or banking context', () => {
    const f = fixture();
    const story = JSON.parse(f.nodes[0].data.storybookJson!);
    story.characters[1].name = 'Alice';
    f.nodes[0].data.storybookJson = JSON.stringify(story);
    expect(f.capture).toThrow(/unique character names/);
  });
});
