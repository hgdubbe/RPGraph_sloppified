import type { RpgraphSessionV2 } from '../data-management/types';
import { useState } from 'react';
import type { LoadedRpgraphFile } from '../app/useRpgraphFiles';
import { useBackdropDismiss } from './useBackdropDismiss';

type TurnAutosaveChoiceDialogProps = {
  startupRestorePending: boolean;
  onConfirmStartupRestore: () => void;
  choices: LoadedRpgraphFile[];
  latestSessionTurnNumber: (session: RpgraphSessionV2) => number;
  onChoose: (choice: LoadedRpgraphFile, password?: string) => Promise<void>;
  onDecline: () => void;
};

/** Obtain consent before reading saved content, then offer available autosaves. */
export function TurnAutosaveChoiceDialog({
  startupRestorePending,
  onConfirmStartupRestore,
  choices,
  latestSessionTurnNumber,
  onChoose,
  onDecline,
}: TurnAutosaveChoiceDialogProps) {
  const backdropDismiss = useBackdropDismiss<HTMLDivElement>(onDecline);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const restore = async (choice: LoadedRpgraphFile) => {
    setRestoring(true);
    setError('');
    try {
      await onChoose(choice, password);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to restore this autosave.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" {...(!restoring ? backdropDismiss : {})}>
      <section
        className="autoturn-instructions-dialog turn-autosave-dialog nodrag"
        role="dialog"
        aria-modal="true"
        aria-label={startupRestorePending ? 'Restore previous workspace' : 'Restore turn autosave'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-title-row">
          <div>
            <span className="eyebrow">STARTUP</span>
            <h2>{startupRestorePending ? 'Restore Previous Workspace?' : 'Restore a Turn Autosave?'}</h2>
          </div>
          <button type="button" onClick={onDecline} disabled={restoring}>
            Start Fresh
          </button>
        </div>
        <div className="event-manager-prompt-body">
          <section className="event-manager-prompt-editor">
            <p className="turn-autosave-choice-copy">{startupRestorePending
              ? 'Restore saved work from this device? This can load your previous workflow, storybook, and RP content. If turn autosaves are enabled and available, you can choose one next. Start Fresh leaves saved content unopened.'
              : 'Choose an autosave to restore, or start fresh without loading saved content.'}</p>
            {startupRestorePending && (
              <button type="button" onClick={onConfirmStartupRestore}>Restore Saved Work</button>
            )}
            {choices.some((choice) => choice.protection === 'encrypted') && (
              <label className="turn-autosave-password">
                Password for the encrypted autosave
                <input type="password" autoComplete="current-password" value={password}
                  disabled={restoring} onChange={(event) => setPassword(event.target.value)} />
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            {choices.map((choice) => {
              const session = choice.value as RpgraphSessionV2;
              const turnNumber = choice.protection === 'encrypted' ? null : latestSessionTurnNumber(session);
              const savedAt = choice.savedAt ? new Date(choice.savedAt).toLocaleString() : 'unknown time';
              return (
                <div key={choice.fileName} className="turn-autosave-choice-row nodrag">
                  <span>
                    <strong>{choice.protection === 'encrypted' ? choice.fileName : choice.name || choice.fileName}</strong> — {turnNumber === null ? 'Encrypted' : `Turn ${turnNumber}`}, saved {savedAt}
                  </span>
                  <button type="button" disabled={restoring || (choice.protection === 'encrypted' && !password)} onClick={() => void restore(choice)}>
                    {choice.protection === 'encrypted' ? 'Unlock & Restore' : 'Restore'}
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
