import type { CSSProperties, ReactNode } from 'react';

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
  activeSurfaceLabel: string;
  headerControls: ReactNode;
  viewTabs: ReactNode;
  characterPicker: ReactNode;
  composerActions: ReactNode;
  surfaces: StorySurfaceItem[];
  onOpenGraphMode: () => void;
  children: ReactNode;
};

const shellStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 14,
  top: 0,
  right: 0,
  bottom: 0,
  display: 'grid',
  gridTemplateColumns: '82px minmax(0, 779px)',
  width: 'min(861px, 100%)',
  minHeight: 0,
  borderLeft: '1px solid #242e40',
  background: '#101620',
  boxShadow: '-16px 0 44px rgba(0, 0, 0, 0.38)',
};

const railStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 0,
  padding: '12px 8px',
  borderRight: '1px solid #242e40',
  background: '#111722',
};

const railButtonStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  minHeight: 44,
  placeItems: 'center',
  padding: '8px 5px',
  border: '1px solid #263247',
  borderRadius: 8,
  color: '#9ba7c2',
  background: '#151d2c',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 750,
};

const activeRailButtonStyle: CSSProperties = {
  color: '#edf1ff',
  borderColor: '#526b87',
  background: '#243147',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
};

const railBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  display: 'grid',
  minWidth: 16,
  height: 16,
  placeItems: 'center',
  padding: '0 4px',
  border: '1px solid #102018',
  borderRadius: 999,
  color: '#f4fff6',
  background: '#4f9a5b',
  fontSize: 9,
  fontWeight: 850,
  lineHeight: 1,
};

const playMainStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  background: '#131b28',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 48,
  padding: '8px 14px',
  borderBottom: '1px solid #1e293b',
  background: '#141c29',
};

const titleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
  color: '#edf1ff',
};

const modeButtonStyle: CSSProperties = {
  height: 28,
  padding: '0 11px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 6,
  color: '#d9e6f8',
  background: 'rgba(255, 255, 255, 0.04)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
};

const stripStyle: CSSProperties = {
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
  padding: '8px 14px',
  borderBottom: '1px solid #1e293b',
  background: '#111824',
};

const contentStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  flexDirection: 'column',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  flex: 'none',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  padding: '8px 14px',
  borderTop: '1px solid #1e293b',
  background: '#111824',
};

export function RoleplayStudioShell({
  activeSurfaceLabel,
  headerControls,
  viewTabs,
  characterPicker,
  composerActions,
  surfaces,
  onOpenGraphMode,
  children,
}: RoleplayStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-play" aria-label="Play Mode" style={shellStyle}>
      <nav className="studio-activity-rail" aria-label="Story surfaces" style={railStyle}>
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            className={`studio-rail-button${surface.active ? ' active' : ''}`}
            type="button"
            disabled={surface.disabled}
            aria-current={surface.active ? 'page' : undefined}
            onClick={surface.onSelect}
            style={{
              ...railButtonStyle,
              ...(surface.active ? activeRailButtonStyle : null),
              ...(surface.disabled ? { cursor: 'not-allowed', opacity: 0.42 } : null),
            }}
          >
            <span>{surface.label}</span>
            {!!surface.badge && (
              <span className="studio-rail-badge" style={railBadgeStyle}>
                {surface.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="studio-play-main" style={playMainStyle}>
        <header className="studio-play-header" style={headerStyle}>
          <div className="studio-play-title" style={titleStyle}>
            <strong>{activeSurfaceLabel}</strong>
            <button
              type="button"
              className="studio-mode-button"
              onClick={onOpenGraphMode}
              style={modeButtonStyle}
            >
              Graph Mode
            </button>
          </div>
          <div className="studio-play-actions">{headerControls}</div>
        </header>

        <div className="studio-character-strip" style={stripStyle}>{characterPicker}</div>
        <div className="studio-view-tabs" style={stripStyle}>{viewTabs}</div>
        <div className="studio-play-content" style={contentStyle}>{children}</div>
        <footer className="studio-play-footer" style={footerStyle}>{composerActions}</footer>
      </div>
    </section>
  );
}
