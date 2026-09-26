import type { ReactNode } from 'react';
import { eventGraphInputText } from '../chat/instructions';
import type { RpAppointment, RpDateTimeFormat, RpWeekdayLanguage, TurnRecord } from '../types';
import { formatRpDateTime } from '../workflow';

type TimelinePanelProps = {
  // "Upcoming" section: EventsPanel's own props, ported verbatim.
  upcomingEvents: RpAppointment[];
  selectedEvent?: RpAppointment;
  highlightedEventIds: Set<string>;
  eventManagerAvailable: boolean;
  runDisabled: boolean;
  isRunning: boolean;
  rpDateTimeFormat: RpDateTimeFormat;
  rpWeekdayLanguage: RpWeekdayLanguage;
  onSelectEvent: (eventId: string) => void;
  onCancelEvent: (eventId: string) => void;
  onRunEvent: () => void;
  // "Recent Turns" section.
  pastTurns: TurnRecord[];
  /** Same TurnControlsHeader element the composer renders; mounted here too as a sticky header. */
  turnControlsHeader: ReactNode;
};

function eventPhoneLabel(event: RpAppointment) {
  return `Phone: ${event.phoneFrom ?? event.assignedTo ?? 'sender'} -> ${event.phoneTo ?? event.requestedBy ?? 'recipient'}`;
}

function eventTimingLabel(
  event: RpAppointment,
  fallback = 'Conditional',
  rpDateTimeFormat?: RpDateTimeFormat,
  rpWeekdayLanguage?: RpWeekdayLanguage,
) {
  return event.scheduledAt
    ? formatRpDateTime(event.scheduledAt, rpDateTimeFormat, rpWeekdayLanguage)
    : event.condition ?? fallback;
}

function turnPreviewText(turn: TurnRecord) {
  const message = turn.output.messages.find((entry) => entry.originalText.trim().length > 0) ??
    turn.input.messages.find((entry) => entry.originalText.trim().length > 0);
  return message?.originalText.trim() ?? '';
}

// Only the latest turn can be regenerated/reflavored/undone; `pastTurns` (see
// useRoleplayPanelRuntime) already excludes it, so every card rendered here
// is browse-only by construction, not by a per-card latest-turn check.
const pastTurnActionDisabledTitle = 'Only the latest turn can be regenerated';

function PastTurnCard({ turn }: { turn: TurnRecord }) {
  const preview = turnPreviewText(turn);
  return (
    <div className="timeline-turn-card">
      <span className="timeline-turn-accent" aria-hidden="true" />
      <span className="studio-rail-badge timeline-turn-chip">{turn.number}</span>
      <div className="timeline-turn-body">
        {preview && <p className="timeline-turn-preview">{preview}</p>}
        <div className="timeline-turn-actions" aria-label={`Turn ${turn.number} actions`}>
          <button type="button" disabled title={pastTurnActionDisabledTitle} aria-label="Regenerate">
            ↶
          </button>
          <button type="button" disabled title={pastTurnActionDisabledTitle} aria-label="Reflavor">
            Rf
          </button>
          <button type="button" disabled title={pastTurnActionDisabledTitle} aria-label="Select variant">
            ≡
          </button>
          <button type="button" disabled title={pastTurnActionDisabledTitle} aria-label="Undo">
            ←
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimelinePanel({
  upcomingEvents,
  selectedEvent,
  highlightedEventIds,
  eventManagerAvailable,
  runDisabled,
  isRunning,
  rpDateTimeFormat,
  rpWeekdayLanguage,
  onSelectEvent,
  onCancelEvent,
  onRunEvent,
  pastTurns,
  turnControlsHeader,
}: TimelinePanelProps) {
  return (
    <div className="timeline-panel">
      <div className="events-surface">
        {!eventManagerAvailable && (
          <div className="events-disabled-overlay">
            <div className="events-disabled-message">
              <span className="events-disabled-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                  <path d="M8 7h8l-1 6a4 4 0 0 1-3 3.9V20h2a1 1 0 0 1 1 1H7a1 1 0 0 1 1-1h2v-3.1A4 4 0 0 1 7 13z" />
                </svg>
              </span>
              <strong>Event Manager not connected</strong>
              <small>Connect it to the workflow to schedule and run events.</small>
            </div>
          </div>
        )}
        <div className="events-list" aria-label="Upcoming events">
          <div className="events-list-header">
            <strong>Upcoming Events</strong>
            <span>{upcomingEvents.length}</span>
          </div>
          <div className="events-items">
            {upcomingEvents.map((event) => (
              <div
                className={`event-item${selectedEvent?.id === event.id ? ' active' : ''}${highlightedEventIds.has(event.id) ? ' unread' : ''}`}
                key={event.id}
              >
                <button
                  className="event-item-content"
                  type="button"
                  onClick={() => onSelectEvent(event.id)}
                >
                  <span className="event-date">
                    {eventTimingLabel(event, 'Conditional', rpDateTimeFormat, rpWeekdayLanguage)}
                  </span>
                  <span className="event-title">{event.title}</span>
                  {event.channel === 'phone' && (
                    <span className="event-source">{eventPhoneLabel(event)}</span>
                  )}
                  {event.details && (
                    <span className="event-source">{event.details}</span>
                  )}
                  {(event.sourceNote || event.sourceTurnNumber !== undefined) && (
                    <span className="event-source">
                      {event.sourceNote ?? `Turn ${event.sourceTurnNumber}`}
                    </span>
                  )}
                </button>
                <button
                  className="event-cancel-button"
                  type="button"
                  aria-label={`Cancel event ${event.title}`}
                  title="Cancel event"
                  onClick={() => onCancelEvent(event.id)}
                >
                  <span aria-hidden="true">X</span>
                </button>
              </div>
            ))}
            {upcomingEvents.length === 0 && (
              <div className="events-empty">
                {eventManagerAvailable ? 'No upcoming events.' : 'Event Manager not connected.'}
              </div>
            )}
          </div>
        </div>
        <div className="event-detail" aria-label="Selected event">
          {selectedEvent ? (
            <>
              <div className="event-detail-header">
                <span>
                  {eventTimingLabel(
                    selectedEvent,
                    'Conditional event',
                    rpDateTimeFormat,
                    rpWeekdayLanguage,
                  )}
                </span>
                <strong>{selectedEvent.title}</strong>
              </div>
              <div className="event-detail-body">
                <div>
                  <small>Mode</small>
                  <span>
                    {selectedEvent.channel === 'phone'
                      ? eventPhoneLabel(selectedEvent)
                      : 'Chat scene'}
                  </span>
                </div>
                {selectedEvent.details && (
                  <div>
                    <small>Details</small>
                    <span>{selectedEvent.details}</span>
                  </div>
                )}
                {selectedEvent.condition && (
                  <div>
                    <small>Condition</small>
                    <span>{selectedEvent.condition}</span>
                  </div>
                )}
                {selectedEvent.requestedBy && (
                  <div>
                    <small>Requested by</small>
                    <span>{selectedEvent.requestedBy}</span>
                  </div>
                )}
                {selectedEvent.assignedTo && (
                  <div>
                    <small>For</small>
                    <span>{selectedEvent.assignedTo}</span>
                  </div>
                )}
                {(selectedEvent.sourceNote || selectedEvent.sourceTurnNumber !== undefined) && (
                  <div>
                    <small>Source</small>
                    <span>{selectedEvent.sourceNote ?? `Turn ${selectedEvent.sourceTurnNumber}`}</span>
                  </div>
                )}
              </div>
              <textarea
                className="event-prompt-preview"
                value={eventGraphInputText(selectedEvent)}
                readOnly
                rows={8}
              />
              <button
                className="event-run-button"
                type="button"
                onClick={onRunEvent}
                disabled={runDisabled}
              >
                {isRunning ? 'Running ...' : 'Run Event'}
              </button>
            </>
          ) : (
            <div className="events-empty">No event selected.</div>
          )}
        </div>
      </div>
      <div className="timeline-recent-turns" aria-label="Recent turns">
        <div className="timeline-recent-turns-header">
          {turnControlsHeader}
        </div>
        <div className="timeline-recent-turns-list">
          {pastTurns.length === 0 ? (
            <div className="events-empty">No past turns yet.</div>
          ) : (
            pastTurns.map((turn) => <PastTurnCard key={turn.id} turn={turn} />)
          )}
        </div>
      </div>
    </div>
  );
}
