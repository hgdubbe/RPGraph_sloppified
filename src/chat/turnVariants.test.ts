import { describe, expect, it } from 'vitest';
import type { TurnCheckpoint } from '../data-management/types';
import type { TurnRecord } from '../types';
import { activeTurnWithVariant, selectableTurnVariants, switchActiveTurnVariant } from './turnVariants';

function turn(id: string, text: string): TurnRecord {
  return {
    id,
    number: 1,
    createdAt: '2026-09-05T12:00:00.000Z',
    input: { graphText: 'input', messages: [] },
    output: { graphText: text, messages: [] },
  };
}

function checkpoint(turnId: string): TurnCheckpoint {
  return {
    turnId,
    createdTimelineEntryIds: [],
    nodeSnapshots: {},
  };
}

describe('turnVariants', () => {
  it('keeps the replaced turn as a selectable variant when committing a regenerated turn', () => {
    const original = turn('turn-1', 'original');
    const regenerated = turn('turn-1', 'regenerated');
    const result = activeTurnWithVariant({
      nextTurn: regenerated,
      replacedTurn: original,
      replacedCheckpoint: checkpoint('turn-1'),
      label: 'Regenerate',
    });

    expect(result.output.graphText).toBe('regenerated');
    expect(selectableTurnVariants(result).map((variant) => variant.turn.output.graphText)).toEqual([
      'regenerated',
      'original',
    ]);
  });

  it('switches a stored variant into the active turn without losing the previous active text', () => {
    const original = turn('turn-1', 'original');
    const regenerated = activeTurnWithVariant({
      nextTurn: turn('turn-1', 'regenerated'),
      replacedTurn: original,
      replacedCheckpoint: checkpoint('turn-1'),
      label: 'Regenerate',
    });

    const switched = switchActiveTurnVariant({
      activeTurn: regenerated,
      targetVariantId: regenerated.variants![0]!.id,
      activeCheckpoint: checkpoint('turn-1'),
    });

    expect(switched?.turn.output.graphText).toBe('original');
    expect(selectableTurnVariants(switched!.turn).map((variant) => variant.turn.output.graphText)).toEqual([
      'original',
      'regenerated',
    ]);
  });
});
