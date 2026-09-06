import { type CSSProperties, type ReactNode } from 'react';

export type StorySurfaceId = 'chat' | 'phone' | 'gallery' | 'social' | 'events' | 'bank' | 'notes';

export type StorySurfaceItem = {
  id: StorySurfaceId;
  label: string;
  badge?: number;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type RoleplayStudioShellProps = {
  characterPicker: ReactNode;
  composerActions: ReactNode;
  surfaces: StorySurfaceItem[];
  panelWidth: number;
  onResizeStart: () => void;
  children: ReactNode;
};

function shellWidthStyle(panelWidth: number): CSSProperties {
  return {
    '--studio-play-panel-width': `${panelWidth}px`,
    '--studio-play-shell-width': `${panelWidth + 89}px`,
  } as CSSProperties;
}

function renderSurfaceIcon(id: StorySurfaceId) {
  switch (id) {
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5h11.5a2.5 2.5 0 0 1 2.5 2.5v5.5a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 14.5V9A2.5 2.5 0 0 1 5 6.5Z" />
          <path d="M8 10h6M8 13h4" />
        </svg>
      );
    case 'phone':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="3" width="8" height="18" rx="2.2" />
          <path d="M10.5 18.5h3" />
        </svg>
      );
    case 'gallery':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="9" cy="9" r="1.4" />
          <path d="m5.5 17 4.4-4.4 3.1 3.1 2-2 3.5 3.8" />
        </svg>
      );
    case 'social':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="16.7" cy="7.4" r="0.9" />
        </svg>
      );
    case 'events':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5.5" width="16" height="14.5" rx="2.2" />
          <path d="M8 3.5v4M16 3.5v4M4 10h16" />
          <path d="M8 14h2M12 14h2M16 14h1M8 17h2M12 17h2" />
        </svg>
      );
    case 'bank':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 9 12 4.5 20.5 9" />
          <path d="M5 9h14M6.5 11v6M10.2 11v6M13.8 11v6M17.5 11v6M4.5 19h15" />
        </svg>
      );
    case 'notes':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3.5h9.5L19 7v13.5H6Z" />
          <path d="M15 3.5V7h4M9 11h6M9 14.5h6M9 18h4" />
        </svg>
      );
  }
}

export function RoleplayStudioShell({
  characterPicker,
  composerActions,
  surfaces,
  panelWidth,
  onResizeStart,
  children,
}: RoleplayStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-play" aria-label="Play Mode" style={shellWidthStyle(panelWidth)}>
      <div
        className="studio-play-resizer"
        role="separator"
        aria-label="Resize play panel"
        aria-orientation="vertical"
        onPointerDown={onResizeStart}
      >
        <span aria-hidden="true" />
      </div>

      <div className="studio-play-main">
        <div className="studio-character-strip">{characterPicker}</div>
        <div className="studio-play-content">{children}</div>
        <div className="studio-play-footer">
        <nav className="studio-activity-rail" aria-label="Story surfaces">
          {surfaces.filter((surface) => surface.id === 'events' || surface.id === 'chat').map((surface) => (
            <button
              key={surface.id}
              className={`studio-rail-button ${surface.id}${surface.active ? ' active' : ''}`}
              type="button"
              disabled={surface.disabled}
              aria-current={surface.active ? 'page' : undefined}
              onClick={surface.onSelect}
            >
              <span className="studio-rail-icon">{renderSurfaceIcon(surface.id)}</span>
              <span>{surface.label}</span>
              {!!surface.badge && <span className="studio-rail-badge">{surface.badge}</span>}
            </button>
          ))}
        </nav>

        {composerActions}</div>
      </div>
    </section>
  );
}
