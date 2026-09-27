import { describe, expect, it } from 'vitest';
import type { MessageRecord, TurnRecord } from '../types';
import { buildTimelineRail, type TimelineRailTurnNode } from './timelineRailStore';

const note = { id: 'note-1', title: 'Harbor reminder', text: 'Meet at noon', dayLabel: 'Day 1', color: 'mint' as const };
const owner = { characterId: 'mara', characterName: 'Mara Venn', note };

function railTurn(messages: MessageRecord[], mode: TurnRecord['mode'] = 'user') {
  const turn: TurnRecord = {
    id: 'turn-1', number: 1, createdAt: '2026-09-27T12:00:00Z', mode,
    input: { graphText: '', messages: [] }, output: { graphText: '', messages },
  };
  return buildTimelineRail([turn], [], {})[0].nodes[0] as TimelineRailTurnNode;
}

describe('timeline rail note activity', () => {
  it('identifies a saved note as Notes and retains its title and owner', () => {
    const node = railTurn([{ id: 1, role: 'output', originalText: '', createdPhoneNote: owner }]);
    expect(node.medium).toEqual({ kind: 'notes', label: 'Notes' });
    expect(node.notes).toEqual([{ title: 'Harbor reminder', action: 'Created' }]);
    expect(node.speakerNames).toEqual(['Mara Venn']);
    expect(node.speakerLabel).toBe('Mara Venn');
  });

  it('includes generated notes alongside narration, rather than hiding their activity', () => {
    const node = railTurn([
      { id: 1, role: 'output', originalText: 'Mara writes down her plans.' },
      { id: 2, role: 'output', originalText: '', createdPhoneNote: owner },
    ], 'narrator');
    expect(node.medium?.kind).toBe('notes');
    expect(node.speakerLabel).toBe('Narrator');
    expect(node.notes[0].action).toBe('Created');
  });

  it('distinguishes note updates and deletions from creation', () => {
    const updated = railTurn([{ id: 1, role: 'output', originalText: '', createdPhoneNote: { ...owner, operation: 'update' } }]);
    const deleted = railTurn([{ id: 2, role: 'output', originalText: '', deletedPhoneNote: owner }]);
    expect(updated.notes[0].action).toBe('Updated');
    expect(deleted.notes[0].action).toBe('Deleted');
    expect(deleted.medium?.kind).toBe('notes');
  });

  it('retains separate speaker names for individual character colors', () => {
    const node = railTurn([{ id: 1, role: 'output', originalText: '', speakerNames: ['Alex', 'Mara Venn'], imageAttachments: [], voiceClips: [] }]);
    expect(node.speakerNames).toEqual(['Alex', 'Mara Venn']);
    expect(node.notes).toEqual([]);
    expect(node.medium?.kind).toBe('in-person');
  });
});
