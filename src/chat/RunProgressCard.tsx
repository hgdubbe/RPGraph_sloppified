import { LiveRunClock } from '../components/LiveRunClock';
import type { RunProgress } from './runProgress';

export function RunProgressCard({
  isRunning,
  activity,
  reasoningTokens,
  runStartTimeMs,
  onCancel,
}: RunProgress & {
  isRunning: boolean;
  runStartTimeMs: number | null;
  onCancel: () => void;
}) {
  if (!isRunning) {
    return null;
  }
  return (
    <aside className="chat-run-progress" aria-live="polite" aria-label="Current workflow step">
      <div className="chat-run-progress-copy">
        <strong title={activity}>{activity}</strong>
      </div>
      <div className="chat-run-progress-controls">
        {reasoningTokens !== undefined ? (
          <span className="chat-run-progress-reasoning" title="Live reasoning tokens">
            RSN: {reasoningTokens}
          </span>
        ) : null}
        {runStartTimeMs !== null && (
          <span className="chat-run-progress-total-time" title="Total workflow time">
            <LiveRunClock isRunning startTimeMs={runStartTimeMs} finalMs={0} /> s
          </span>
        )}
        <span className="chat-run-progress-bars" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </aside>
  );
}
