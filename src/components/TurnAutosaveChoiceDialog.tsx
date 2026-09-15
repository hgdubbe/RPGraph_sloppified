import type { RpgraphSessionV2 } from '../data-management/types';
import type { LoadedRpgraphFile } from '../app/useRpgraphFiles';
import { useBackdropDismiss } from './useBackdropDismiss';

type TurnAutosaveChoiceDialogProps = {
  choices: LoadedRpgraphFile[];
  latestSessionTurnNumber: (session: RpgraphSessionV2) => number;
  onChoose: (choice: LoadedRpgraphFile) => void;
  onDecline: () => void;
};

/**
 * Startup only: there are two rolling turn-autosave slots (`turn-autosave-a`/`-b` in
 * electron/main.cjs), and the app used to always silently restore whichever one has the
 * newer file-modified time. That can silently pick a slot that finished writing mid-crash
 * over a good older one, with no way to tell — so instead, when more than one valid slot
 * exists, ask which conversation state to restore, showing each one's own save time and
 * turn number to tell them apart.
 */
export function TurnAutosaveChoiceDialog({
  choices,
  latestSessionTurnNumber,
  onChoose,
  onDecline,
}: TurnAutosaveChoiceDialogProps) {
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onDecline);

  return (
    <div className="dialog-backdrop" role="presentation" {...backdropDismiss}>
      <section
        className="autoturn-instructions-dialog nodrag"
        role="dialog"
        aria-modal="true"
        aria-label="Restore turn autosave"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-title-row">
          <div>
            <span className="eyebrow">STARTUP</span>
            <h2>Restore a Turn Autosave?</h2>
          </div>
          <button type="button" onClick={onDecline}>
            Skip
          </button>
        </div>
        <div className="event-manager-prompt-body">
          <section className="event-manager-prompt-editor">
            <p>More than one recent turn autosave was found. Choose which one to restore, or skip to load the last workflow instead.</p>
            {choices.map((choice) => {
              const session = choice.value as RpgraphSessionV2;
              const turnNumber = latestSessionTurnNumber(session);
              const savedAt = choice.savedAt ? new Date(choice.savedAt).toLocaleString() : 'unknown time';
              return (
                <div key={choice.fileName} className="node-toggle nodrag" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <strong>{choice.name || choice.fileName}</strong> — Turn {turnNumber}, saved {savedAt}
                  </span>
                  <button type="button" onClick={() => onChoose(choice)}>
                    Restore
                  </button>
                </div>
              );
            })}
          </section>
        </div>
      </section>
    </div>
  );
}
