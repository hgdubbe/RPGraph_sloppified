import { describe, expect, it } from 'vitest';
import type { WorkflowNodeData } from '../../types';
import { resolveDecisionBlockExtras, resolveDecisionRouterSettings } from './decisionRouterModel';

function data(overrides: Partial<WorkflowNodeData> = {}): WorkflowNodeData {
  return { nodeType: 'decision-router', label: 'Decision Router', description: '', preview: '', ...overrides } as WorkflowNodeData;
}

describe('resolveDecisionRouterSettings', () => {
  it('falls back to defaultDecisionComposition values when unset', () => {
    expect(resolveDecisionRouterSettings(data())).toEqual({
      narrativeness: 2, defaultActiveness: 2, maxActionsPerTurn: 3, respectUserAgency: true, styleTone: '', sequenceGuidance: '',
    });
  });

  it('reads explicit settings off the node data', () => {
    const settings = resolveDecisionRouterSettings(data({
      decisionNarrativeness: 4, decisionDefaultActiveness: 0, decisionMaxActionsPerTurn: 1,
      decisionRespectUserAgency: false, decisionStyleTone: 'Dry wit.', decisionSequenceGuidance: 'Favor short scenes.',
    }));
    expect(settings).toEqual({
      narrativeness: 4, defaultActiveness: 0, maxActionsPerTurn: 1, respectUserAgency: false,
      styleTone: 'Dry wit.', sequenceGuidance: 'Favor short scenes.',
    });
  });
});

describe('resolveDecisionBlockExtras', () => {
  it('returns an empty object when nothing is set', () => {
    expect(resolveDecisionBlockExtras(data())).toEqual({});
  });

  it('omits a blank styleTone', () => {
    expect(resolveDecisionBlockExtras(data({ decisionStyleTone: '   ' }))).toEqual({});
  });

  it('carries a trimmed styleTone and the raw overrides map through', () => {
    const overrides = { narration: { before: 'B.', after: 'A.' } };
    expect(resolveDecisionBlockExtras(data({ decisionStyleTone: '  Dry wit.  ', decisionBlockPromptOverrides: overrides })))
      .toEqual({ styleTone: 'Dry wit.', overrides });
  });
});
