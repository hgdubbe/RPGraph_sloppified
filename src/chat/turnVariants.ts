import type { TurnCheckpoint } from '../data-management/types';
import type { TurnRecord, TurnRecordVariant } from '../types';

type ActiveTurnWithVariantInput = {
  nextTurn: TurnRecord;
  replacedTurn: TurnRecord;
  replacedCheckpoint?: TurnCheckpoint;
  label: string;
};

function turnWithoutVariants(turn: TurnRecord): Omit<TurnRecord, 'variants'> {
  const { variants: _variants, ...baseTurn } = turn;
  return structuredClone(baseTurn);
}

function variantId(turn: TurnRecord, label: string) {
  return `${turn.id}-variant-${label.toLocaleLowerCase()}-${Date.now()}`;
}

function turnVariant(
  turn: TurnRecord,
  label: string,
  checkpoint?: TurnCheckpoint,
): TurnRecordVariant {
  return {
    id: variantId(turn, label),
    label,
    createdAt: new Date().toISOString(),
    turn: turnWithoutVariants(turn),
    checkpoint: checkpoint ? structuredClone(checkpoint) : undefined,
  };
}

export function activeTurnWithVariant({
  nextTurn,
  replacedTurn,
  replacedCheckpoint,
  label,
}: ActiveTurnWithVariantInput): TurnRecord {
  return {
    ...nextTurn,
    variants: [
      ...(nextTurn.variants ?? []),
      turnVariant(replacedTurn, label, replacedCheckpoint),
      ...(replacedTurn.variants ?? []),
    ],
  };
}

export function selectableTurnVariants(turn: TurnRecord): TurnRecordVariant[] {
  return [
    {
      id: `${turn.id}-active`,
      label: 'Current',
      createdAt: turn.createdAt,
      turn: turnWithoutVariants(turn),
    },
    ...(turn.variants ?? []),
  ];
}

export function switchActiveTurnVariant({
  activeTurn,
  targetVariantId,
  activeCheckpoint,
}: {
  activeTurn: TurnRecord;
  targetVariantId: string;
  activeCheckpoint?: TurnCheckpoint;
}): { turn: TurnRecord; checkpoint?: TurnCheckpoint } | null {
  const targetVariant = activeTurn.variants?.find((variant) => variant.id === targetVariantId);
  if (!targetVariant) {
    return null;
  }
  const restoredTurn: TurnRecord = {
    ...structuredClone(targetVariant.turn),
    variants: [
      turnVariant(activeTurn, 'Previous active', activeCheckpoint),
      ...(activeTurn.variants ?? []).filter((variant) => variant.id !== targetVariantId),
    ],
  };
  return {
    turn: restoredTurn,
    checkpoint: targetVariant.checkpoint,
  };
}
