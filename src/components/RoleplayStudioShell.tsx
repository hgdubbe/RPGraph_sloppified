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

export function RoleplayStudioShell({
  activeSurfaceLabel,
  headerControls,
  viewTabs,
  characterPicker,
  composerActions,
  surfaces,
  onOpenGraphMode,
  panelWidth,
  onResizeStart,
  children,
}: RoleplayStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-play" aria-label="Play Mode" style={shellWidthStyle(panelWidth)}>
      <nav className="studio-activity-rail" aria-label="Story surfaces">
        {surfaces.map((surface) => (
          <button
            key={surface.id}
            className={`studio-rail-button${surface.active ? ' active' : ''}`}
            type="button"
            disabled={surface.disabled}
            aria-current={surface.active ? 'page' : undefined}
            onClick={surface.onSelect}
          >
            <span>{surface.label}</span>
            {!!surface.badge && <span className="studio-rail-badge">{surface.badge}</span>}
          </button>
        ))}
      </nav>

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
        <header className="studio-play-header">
          <div className="studio-play-title">
            <strong>{activeSurfaceLabel}</strong>
            <button
              type="button"
              className="studio-mode-button"
              onClick={onOpenGraphMode}
            >
              Graph Mode
            </button>
          </div>
          <div className="studio-play-actions">{headerControls}</div>
        </header>

        <div className="studio-character-strip">{characterPicker}</div>
        <div className="studio-view-tabs">{viewTabs}</div>
        <div className="studio-play-content">{children}</div>
        <footer className="studio-play-footer">{composerActions}</footer>
      </div>
    </section>
  );
}
