import type { TurnRecord, TurnRecordVariant } from '../types';

type TurnControlsHeaderProps = {
  switchActivePlayer: () => void;
  switchPlayerDisabled: boolean;
  switchPlayerTitle: string;
  triggerAutoTurn: () => void;
  autoTurnDisabled: boolean;
  autoTurnTitle: string;
  isEventView: boolean;
  cancelRunOrUndoLastTurn: () => void;
  undoTurnDisabled: boolean;
  undoTurnTitle: string;
  isRunning: boolean;
  regenerateLastOutput: (options?: { reflavor?: boolean }) => void;
  currentSessionTurn: TurnRecord | undefined;
  currentTurnVariants: TurnRecordVariant[];
  selectLastTurnVariant: (variantId: string) => void;
};

/** Extracted verbatim from App.tsx's inline `roleplayComposerActions` block. */
export function TurnControlsHeader({
  switchActivePlayer,
  switchPlayerDisabled,
  switchPlayerTitle,
  triggerAutoTurn,
  autoTurnDisabled,
  autoTurnTitle,
  isEventView,
  cancelRunOrUndoLastTurn,
  undoTurnDisabled,
  undoTurnTitle,
  isRunning,
  regenerateLastOutput,
  currentSessionTurn,
  currentTurnVariants,
  selectLastTurnVariant,
}: TurnControlsHeaderProps) {
  return (
    <div className="chat-actions">
      <button
        className="switch-player-button"
        type="button"
        onClick={switchActivePlayer}
        disabled={switchPlayerDisabled}
        data-disabled-look={switchPlayerDisabled ? 'true' : undefined}
        title={switchPlayerTitle}
      >
        Switch
      </button>
      <div className="header-turn-actions">
        <button
          className="auto-turn-button"
          type="button"
          onClick={triggerAutoTurn}
          disabled={autoTurnDisabled}
          data-disabled-look={autoTurnDisabled ? 'true' : undefined}
          title={autoTurnTitle}
        >
          {isEventView ? 'Run Event' : 'AutoTurn'}
        </button>
        <div className="turn-controls" aria-label="Turn actions">
          <button
            type="button"
            onClick={cancelRunOrUndoLastTurn}
            disabled={undoTurnDisabled}
            title={undoTurnTitle}
            aria-label={undoTurnTitle}
          >
            {isRunning ? 'x' : '←'}
          </button>
          <button
            type="button"
            onClick={() => regenerateLastOutput()}
            disabled={!isRunning && !currentSessionTurn}
            title={isRunning ? 'Cancel and restart the running RP output' : 'Regenerate the last RP output'}
            aria-label={isRunning ? 'Cancel and restart the running RP output' : 'Regenerate the last RP output'}
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => regenerateLastOutput({ reflavor: true })}
            disabled={isRunning || !currentSessionTurn}
            title="Reflavor the last output while preserving the same continuity"
            aria-label="Reflavor the last output while preserving continuity"
          >
            Rf
          </button>
        </div>
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
