import { describe, expect, it } from 'vitest';
import { buildLiveContextSource } from './liveContextSource';
import { captureTurnContext } from './contextBuilder';

const scope = { saveId: 'save', branchId: 'branch', turnId: 'turn' };

describe('buildLiveContextSource', () => {
  it('carries nodes/messages/instructions through and defaults latestMessageIds', () => {
    const source = buildLiveContextSource({ nodes: [], messages: [], instructions: { write: 'Be concise.' } });
    expect(source).toMatchObject({ nodes: [], messages: [], latestMessageIds: [], instructions: { write: 'Be concise.' } });
    expect(source.facts).toBeUndefined();
  });

  it('exposes a trimmed current-input note as a shared fact instead of a fake message id', () => {
    const source = buildLiveContextSource({ nodes: [], messages: [], currentInputText: '  hello there  ', instructions: {} });
    expect(source.facts).toEqual([{ sourceId: 'current-input', text: 'hello there', visibility: { kind: 'shared' } }]);
  });

  it('omits the current-input fact for blank input', () => {
    const source = buildLiveContextSource({ nodes: [], messages: [], currentInputText: '   ', instructions: {} });
    expect(source.facts).toBeUndefined();
  });

  it('is accepted by captureTurnContext as a read() result', () => {
    const { store, view } = captureTurnContext({
      scope, catalogRevision: 'catalog-1',
      read: () => buildLiveContextSource({ nodes: [], messages: [], currentInputText: 'hi', instructions: { write: 'Be concise.' } }),
    });
    const system = view();
    const oc = store.read(system.context.OC, scope, 'system');
    expect(oc.value).toMatchObject({ kind: 'facts', facts: [{ sourceId: 'current-input', text: 'hi' }] });
  });
});
