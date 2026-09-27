import { useState, type ReactNode } from 'react';
import type { RpAppointment, RpDateTimeFormat, RpWeekdayLanguage, TurnRecord } from '../types';
import { CharacterName } from './CharacterName';
import {
  buildTimelineRail,
  type RailMediumKind,
  type TimelineRailEventNode,
  type TimelineRailNode,
  type TimelineRailTurnNode,
} from '../data-management/timelineRailStore';

type TimelinePanelProps = {
  characterColors: Map<string, string>;
  // Event Manager: kept fully functional in this panel (see architect notes)
  // -- each event's rail entry gets inline run/cancel buttons instead of the
  // old separate selected-event detail pane.
  upcomingEvents: RpAppointment[];
  highlightedEventIds: Set<string>;
  eventManagerAvailable: boolean;
  runDisabled: boolean;
  isRunning: boolean;
  rpDateTimeFormat: RpDateTimeFormat;
  rpWeekdayLanguage: RpWeekdayLanguage;
  onRunEvent: (event: RpAppointment) => void;
  onCancelEvent: (eventId: string) => void;
  // Structural rail: every turn (including the current/latest one), plus
  // events, interleaved into day-grouped (or flat) sections.
  allTurns: TurnRecord[];
  onJumpToTurn: (turnId: string) => void;
  /** Same TurnControlsHeader element the composer renders; mounted here too as a sticky header. */
  turnControlsHeader: ReactNode;
};

// Reuses the exact glyphs from PhoneAppSwitcherStrip's in-fiction app roster
// (WhatsUp/Fotogram/OnlyFriends/MatchMe/Banking) so the timeline's medium
// marker reads as "which app" rather than a generic message-type icon.
function mediumIconPath(kind: RailMediumKind) {
  switch (kind) {
    case 'notes':
      return (
        <svg className="rail-medium-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 3h14v13l-5 5H5zM14 21v-5h5M8 8h8M8 12h6" />
        </svg>
      );
    case 'whatsup':
      return (
        <svg className="rail-medium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18.8 5.2A8.9 8.9 0 0 0 4.7 15.9L3.4 20.4l4.7-1.2A8.9 8.9 0 1 0 18.8 5.2Z" />
        </svg>
      );
    case 'fotogram':
      return (
        <svg className="rail-medium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1" />
        </svg>
      );
    case 'onlyfriends':
      return <span className="rail-medium-monogram" aria-hidden="true">OF</span>;
    case 'matchme':
      return (
        <svg className="rail-medium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 13.5c1.2-1.3 1.8-2.7 1.8-3.9A4.1 4.1 0 0 0 12 6.9a4.1 4.1 0 0 0-8.8 2.7c0 1.2.6 2.6 1.8 3.9l7 6.8Z" />
        </svg>
      );
    case 'banking':
      return (
        <svg className="rail-medium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9 12 4l9 5" />
          <path d="M4 9h16" />
          <path d="M6 11v7M10 11v7M14 11v7M18 11v7" />
          <path d="M3 20h18" />
        </svg>
      );
    case 'narration':
      return (
        <svg className="rail-medium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 3h11l3 3v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M15 3v4h4" />
          <path d="M8 11h8M8 15h8M8 19h5" />
        </svg>
      );
    case 'in-person':
    default:
      // Speech bubble -- the plain, no-app fallback.
      return (
        <svg className="rail-medium-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-4 4v-4H4z" />
        </svg>
      );
  }
}

function AttachmentIcons({ images, voiceClips }: { images: number; voiceClips: number }) {
  if (images === 0 && voiceClips === 0) {
    return null;
  }
  return (
    <span className="rail-attachments" aria-label="Attachments">
      {images > 0 && (
        <span className="rail-attachment-chip" aria-label={`${images} image${images === 1 ? '' : 's'}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
            <path d="M21 16l-5.5-5.5L9 17" />
          </svg>
          <span>{images} <small>{images === 1 ? 'image' : 'images'}</small></span>
        </span>
      )}
      {voiceClips > 0 && (
        <span className="rail-attachment-chip" aria-label={`${voiceClips} voice clip${voiceClips === 1 ? '' : 's'}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2.5" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.5" />
          </svg>
          <span>{voiceClips} <small>{voiceClips === 1 ? 'voice clip' : 'voice clips'}</small></span>
        </span>
      )}
    </span>
  );
}

function HistoryBadges({ reroll, rephrase, onClick }: { reroll: number; rephrase: number; onClick: () => void }) {
  if (reroll === 0 && rephrase === 0) {
    return null;
  }
  return (
    <span className="rail-history-badges">
      {reroll > 0 && (
        <button
          type="button"
          className="rail-history-badge"
          title={`${reroll} reroll${reroll === 1 ? '' : 's'} -- jump to this turn`}
          aria-label={`${reroll} rerolls`}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8M21 4v4h-4" />
            <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16M3 20v-4h4" />
          </svg>
          <span>{reroll}</span>
        </button>
      )}
      {rephrase > 0 && (
        <button
          type="button"
          className="rail-history-badge"
          title={`${rephrase} rephrase${rephrase === 1 ? '' : 's'} -- jump to this turn`}
          aria-label={`${rephrase} rephrases`}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M4 12h11M4 17h14" />
          </svg>
          <span>{rephrase}</span>
        </button>
      )}
    </span>
  );
}

function TurnRailNode({ node, onJumpToTurn, characterColors }: { node: TimelineRailTurnNode; onJumpToTurn: (turnId: string) => void; characterColors: Map<string, string> }) {
  return (
    <div
      className={`rail-node rail-turn-node${node.isCurrent ? ' is-current' : ''}${node.attachments.images > 0 ? ' has-images' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onJumpToTurn(node.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onJumpToTurn(node.id);
        }
      }}
      aria-label={`Jump to turn ${node.turnNumber}, ${node.speakerLabel}`}
    >
      <span className="rail-node-marker" aria-hidden="true" title={node.medium?.label ?? 'In-person'}>
        {mediumIconPath(node.medium?.kind ?? 'in-person')}
      </span>
      <div className="rail-node-body">
        <div className="rail-node-row rail-node-row-primary">
          <span className="rail-speaker-label">
            {node.speakerNames.length > 0 ? node.speakerNames.map((name, index) => (
              <span key={name}>{index > 0 && ', '}<CharacterName color={characterColors.get(name)}>{name}</CharacterName></span>
            )) : node.speakerLabel}
          </span>
          <span className="rail-turn-meta">
            {node.isCurrent && <span className="rail-current-label">Latest</span>}
            <span className="rail-sequence">{node.sequenceLabel}</span>
          </span>
        </div>
        <div className="rail-node-row rail-node-row-secondary">
          <span className="rail-node-time">
            {node.relativeLabel && <span className="rail-relative">{node.relativeLabel} · </span>}
            <span className={`rail-timestamp${node.hasRpDateTime ? '' : ' is-fallback'}`}>{node.rpTimestamp}</span>
          </span>
          {node.medium && (
            <span className="rail-medium" title={node.medium.label}>
              <span className="rail-medium-label">{node.medium.label}</span>
            </span>
          )}
        </div>
        {node.attachments.images > 0 && (
          <span className="rail-image-summary">
            <AttachmentIcons images={node.attachments.images} voiceClips={0} />
          </span>
        )}
        <AttachmentIcons images={0} voiceClips={node.attachments.voiceClips} />
        {node.notes.map((note, index) => (
          <div className="rail-note-summary" key={index}>
            <small>{note.action} note</small>
            <span>{note.title}</span>
          </div>
        ))}
        {(node.badges.reroll > 0 || node.badges.rephrase > 0) && <div className="rail-node-row rail-node-row-footer">
          <HistoryBadges
            reroll={node.badges.reroll}
            rephrase={node.badges.rephrase}
            onClick={() => onJumpToTurn(node.id)}
          />
        </div>}
      </div>
    </div>
  );
}

function EventRailNode({
  node,
  eventManagerAvailable,
  runDisabled,
  isRunning,
  isHighlighted,
  onRunEvent,
  onCancelEvent,
}: {
  node: TimelineRailEventNode;
  eventManagerAvailable: boolean;
  runDisabled: boolean;
  isRunning: boolean;
  isHighlighted: boolean;
  onRunEvent: (event: RpAppointment) => void;
  onCancelEvent: (eventId: string) => void;
}) {
  return (
    <div className={`rail-node rail-event-node${isHighlighted ? ' is-unread' : ''}${node.occurred ? ' is-occurred' : ''}`}>
      <span className="rail-node-marker" aria-hidden="true">
        <svg className="rail-flag-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          {node.occurred ? (
            <path d="M5 2v20M5 3h13l-3.2 4.2L18 11.5H5" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          ) : (
            <path
              d="M5 2v20M5 3h13l-3.2 4.2L18 11.5H5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeDasharray="2.5 2"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
      <div className="rail-node-body">
        <div className="rail-node-row rail-node-row-primary">
          <span className="rail-event-title">{node.title}</span>
          <span className="rail-timestamp">{node.rpTimestamp}</span>
        </div>
      </div>
      {/* Occurred events already happened -- no run/cancel controls, just the
          record of it (this path is best-effort/rare today, see anchorTurnId
          note in timelineRailStore.ts). Only pending events stay actionable. */}
      {!node.occurred && (
        <div className="rail-event-actions">
          <button
            type="button"
            className="rail-event-run-button"
            aria-label={`Run event ${node.title}`}
            title={eventManagerAvailable ? 'Run this event' : 'Event Manager not connected'}
            disabled={runDisabled}
            onClick={() => onRunEvent(node.event)}
          >
            {isRunning ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l5 5L20 6" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="rail-event-cancel-button"
            aria-label={`Cancel event ${node.title}`}
            title="Cancel event"
            onClick={() => onCancelEvent(node.id)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function RailNodeRenderer({
  node,
  characterColors,
  eventManagerAvailable,
  runDisabled,
  isRunning,
  highlightedEventIds,
  onJumpToTurn,
  onRunEvent,
  onCancelEvent,
}: {
  node: TimelineRailNode;
  characterColors: Map<string, string>;
  eventManagerAvailable: boolean;
  runDisabled: boolean;
  isRunning: boolean;
  highlightedEventIds: Set<string>;
  onJumpToTurn: (turnId: string) => void;
  onRunEvent: (event: RpAppointment) => void;
  onCancelEvent: (eventId: string) => void;
}) {
  if (node.kind === 'turn') {
    return <TurnRailNode node={node} onJumpToTurn={onJumpToTurn} characterColors={characterColors} />;
  }
  return (
    <EventRailNode
      node={node}
      eventManagerAvailable={eventManagerAvailable}
      runDisabled={runDisabled}
      isRunning={isRunning}
      isHighlighted={highlightedEventIds.has(node.id)}
      onRunEvent={onRunEvent}
      onCancelEvent={onCancelEvent}
    />
  );
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`rail-section-chevron${collapsed ? ' is-collapsed' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function TimelinePanel({
  characterColors,
  upcomingEvents,
  highlightedEventIds,
  eventManagerAvailable,
  runDisabled,
  isRunning,
  rpDateTimeFormat,
  rpWeekdayLanguage,
  onRunEvent,
  onCancelEvent,
  allTurns,
  onJumpToTurn,
  turnControlsHeader,
}: TimelinePanelProps) {
  const sections = buildTimelineRail(allTurns, upcomingEvents, { rpDateTimeFormat, rpWeekdayLanguage });
  const isEmpty = sections.every((section) => section.nodes.length === 0);
  const totalTurns = sections.reduce((sum, section) => sum + section.turnCount, 0);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  function sectionKey(section: (typeof sections)[number], index: number) {
    return section.dayKey ?? section.label ?? `section-${index}`;
  }

  function toggleSection(key: string) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="timeline-panel timeline-rail-panel">
      <div className="timeline-recent-turns-header">{turnControlsHeader}</div>
      <div className="rail-panel-header">
        <div className="rail-panel-heading">
          <strong>Timeline</strong>
          <small>Structural view · {totalTurns} turn{totalTurns === 1 ? '' : 's'}</small>
        </div>
        <button
          type="button"
          className="rail-panel-collapse-all"
          aria-label={collapsedSections.size > 0 ? 'Expand all sections' : 'Collapse all sections'}
          title={collapsedSections.size > 0 ? 'Expand all sections' : 'Collapse all sections'}
          onClick={() => {
            setCollapsedSections((current) =>
              current.size > 0 ? new Set() : new Set(sections.map((section, index) => sectionKey(section, index))),
            );
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={collapsedSections.size > 0 ? 'm8 8 4 4 4-4M8 13l4 4 4-4' : 'm8 11 4-4 4 4M8 16l4-4 4 4'} />
          </svg>
        </button>
      </div>
      {!eventManagerAvailable && (
        <div className="rail-connection-notice" role="status">
          <div className="rail-connection-message">
            <span className="events-disabled-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                <path d="M8 7h8l-1 6a4 4 0 0 1-3 3.9V20h2a1 1 0 0 1 1 1H7a1 1 0 0 1 1-1h2v-3.1A4 4 0 0 1 7 13z" />
              </svg>
            </span>
            <strong>Event Manager not connected</strong>
            <small>Connect it to include events in your timeline.</small>
          </div>
        </div>
      )}
      <div className="timeline-rail-scroll" aria-label="Roleplay timeline">
        {isEmpty ? (
          <div className="events-empty">Nothing to show yet.</div>
        ) : (
          sections.map((section, index) => {
            const key = sectionKey(section, index);
            const collapsed = collapsedSections.has(key);
            return (
              <section className={`rail-section${section.isPlanned ? ' is-planned' : ''}`} key={key} aria-label={section.label}>
                {section.label && (
                  <button
                    type="button"
                    className="rail-section-header"
                    onClick={() => toggleSection(key)}
                    aria-expanded={!collapsed}
                  >
                    <CollapseChevron collapsed={collapsed} />
                    <strong>{section.label}</strong>
                    <span className="rail-section-count">
                      {section.isPlanned ? 'planned' : `${section.turnCount} turn${section.turnCount === 1 ? '' : 's'}`}
                    </span>
                  </button>
                )}
                {!collapsed && (
                  <div className="rail-section-nodes">
                    {section.nodes.map((node) => (
                      <RailNodeRenderer
                        key={`${node.kind}-${node.id}`}
                        characterColors={characterColors}
                        node={node}
                        eventManagerAvailable={eventManagerAvailable}
                        runDisabled={runDisabled}
                        isRunning={isRunning}
                        highlightedEventIds={highlightedEventIds}
                        onJumpToTurn={onJumpToTurn}
                        onRunEvent={onRunEvent}
                        onCancelEvent={onCancelEvent}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
