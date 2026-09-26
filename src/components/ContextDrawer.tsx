import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ContextDrawerContent } from '../app/useRoleplayPanelRuntime';

const drawerMinWidth = 360;
const drawerMaxWidth = 560;

function clampDrawerWidth(width: number) {
  return Math.min(drawerMaxWidth, Math.max(drawerMinWidth, width));
}

function PhoneRailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3" width="8" height="18" rx="2.2" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

function TimelineRailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

function EventsRailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
      <path d="M8 14h2M12 14h2M16 14h1M8 17h2M12 17h2" />
    </svg>
  );
}

export type ContextDrawerProps = {
  /** Phase 1's `drawerContent` — the single source of truth for which panel
   * is open; `chatPanelView` (see useRoleplayPanelRuntime.ts) is derived from it. */
  content: ContextDrawerContent;
  onSelectPhone: () => void;
  onSelectEvents: () => void;
  onSelectTimeline: () => void;
  onClose: () => void;
  isNarrowLayout: boolean;
  width: number | undefined;
  onWidthChange: (width: number | undefined) => void;
  phoneBadge: number;
  eventsBadge: number;
  phoneContent: ReactNode;
  eventsContent: ReactNode;
  timelineContent: ReactNode;
  drawerRef?: (element: HTMLDivElement | null) => void;
};

export function ContextDrawer({
  content,
  onSelectPhone,
  onSelectEvents,
  onSelectTimeline,
  onClose,
  isNarrowLayout,
  width,
  onWidthChange,
  phoneBadge,
  eventsBadge,
  phoneContent,
  eventsContent,
  timelineContent,
  drawerRef,
}: ContextDrawerProps) {
  const open = content !== null;
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setContainerRef = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
    drawerRef?.(element);
  }, [drawerRef]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      // Falls back to the drawer's actual rendered width (not the clamp's
      // own default) so a first drag with no persisted width yet doesn't
      // jump the drawer to `drawerMinWidth` before applying the delta.
      startWidth: clampDrawerWidth(width ?? containerRef.current?.getBoundingClientRect().width ?? drawerMinWidth),
    };
    setDragging(true);
  }, [width]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    // The handle sits on the drawer's left border; dragging left (toward the
    // chat pane) grows the drawer, so the delta is inverted from clientX.
    onWidthChange(clampDrawerWidth(drag.startWidth + (drag.startX - event.clientX)));
  }, [onWidthChange]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragStateRef.current = null;
      setDragging(false);
    }
  }, []);

  return (
    <>
      <nav className="studio-drawer-toggle-rail" aria-label="Context drawer">
        <button
          type="button"
          className={`studio-rail-button phone${content === 'phone' ? ' active' : ''}`}
          aria-pressed={content === 'phone'}
          title="Phone"
          onClick={onSelectPhone}
        >
          <span className="studio-rail-icon"><PhoneRailIcon /></span>
          {!!phoneBadge && <span className="studio-rail-badge">{phoneBadge}</span>}
        </button>
        <button
          type="button"
          className={`studio-rail-button events${content === 'events' ? ' active' : ''}`}
          aria-pressed={content === 'events'}
          title="Events"
          onClick={onSelectEvents}
        >
          <span className="studio-rail-icon"><EventsRailIcon /></span>
          {!!eventsBadge && <span className="studio-rail-badge">{eventsBadge}</span>}
        </button>
        <button
          type="button"
          className={`studio-rail-button timeline${content === 'timeline' ? ' active' : ''}`}
          aria-pressed={content === 'timeline'}
          title="Timeline"
          onClick={onSelectTimeline}
        >
          <span className="studio-rail-icon"><TimelineRailIcon /></span>
        </button>
      </nav>
      {isNarrowLayout && open && (
        <button
          type="button"
          className="studio-context-drawer-backdrop"
          aria-label="Close drawer"
          onClick={onClose}
        />
      )}
      <div
        ref={setContainerRef}
        className={`studio-context-drawer${open ? ' open' : ''}`}
        style={width ? ({ '--studio-context-drawer-width': `${clampDrawerWidth(width)}px` } as React.CSSProperties) : undefined}
        aria-hidden={isNarrowLayout ? !open : false}
        inert={isNarrowLayout ? !open : false}
        tabIndex={-1}
      >
        <div
          className={`studio-drawer-resize-handle${dragging ? ' dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize context drawer"
        />
        {isNarrowLayout && (
          <button
            type="button"
            className="studio-context-drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        )}
        <div className="studio-context-drawer-pane" hidden={content !== 'phone'}>{phoneContent}</div>
        <div className="studio-context-drawer-pane" hidden={content !== 'events'}>{eventsContent}</div>
        <div className="studio-context-drawer-pane" hidden={content !== 'timeline'}>{timelineContent}</div>
      </div>
    </>
  );
}
