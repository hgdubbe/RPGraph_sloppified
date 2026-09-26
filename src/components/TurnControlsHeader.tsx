import type { TurnRecord, TurnRecordVariant } from '../types';

type TurnControlsHeaderProps = {
  isRunning: boolean;
  currentSessionTurn: TurnRecord | undefined;
  currentTurnVariants: TurnRecordVariant[];
  selectLastTurnVariant: (variantId: string) => void;
};

/** Extracted verbatim from App.tsx's inline `roleplayComposerActions` block.
 * Switch and the back/regenerate/rephrase turn actions moved out to their own
 * pills in the composer's pills row (see App.tsx's roleplaySwitchPill /
 * roleplayHistoryActionsPill); AutoTurn moved to its own small button beside
 * the composer's send button (ChatConversationPanel.tsx's
 * composer-autoturn-button) -- this header now only covers the turn-variant
 * picker and the turn counter. */
export function TurnControlsHeader({
  isRunning,
  currentSessionTurn,
  currentTurnVariants,
  selectLastTurnVariant,
}: TurnControlsHeaderProps) {
  return (
    <div className="chat-actions">
      <div className="header-turn-actions">
        {currentTurnVariants.length > 1 && (
          <select
            className="turn-variant-select"
            aria-label="Turn variant"
            value={`${currentSessionTurn?.id}-active`}
            disabled={isRunning}
            onChange={(event) => selectLastTurnVariant(event.target.value)}
          >
            {currentTurnVariants.map((variant, index) => (
              <option key={variant.id} value={variant.id}>
                {index + 1}. {variant.label}
              </option>
            ))}
          </select>
        )}
        <span className="turn-counter">
          Turn {currentSessionTurn?.number ?? 0}
        </span>
      </div>
    </div>
  );
}
