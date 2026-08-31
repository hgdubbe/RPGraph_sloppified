import { useState, type CSSProperties, type ReactNode } from 'react';

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
  sceneLabel: string;
  headerControls: ReactNode;
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
  sceneLabel,
  headerControls,
  characterPicker,
  composerActions,
  surfaces,
  onOpenGraphMode,
  panelWidth,
  onResizeStart,
  children,
}: RoleplayStudioShellProps) {
  const [storyStateOpen, setStoryStateOpen] = useState(true);

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
        <header className="studio-play-header">
          <div className="studio-play-brand">
            <span className="studio-play-logo" aria-hidden="true">RP</span>
            <strong>RPGraph<br />Studio</strong>
          </div>
          <div className="studio-play-scene">
            <strong>{sceneLabel}</strong>
            <span>{activeSurfaceLabel}</span>
          </div>
          <div className="studio-play-actions">{headerControls}</div>
          <button
            type="button"
            className="studio-mode-button"
            onClick={onOpenGraphMode}
          >
            Graph Mode
          </button>
        </header>

        <nav className="studio-activity-rail" aria-label="Story surfaces">
          {surfaces.map((surface) => (
            <button
              key={surface.id}
              className={`studio-rail-button ${surface.id}${surface.active ? ' active' : ''}`}
              type="button"
              disabled={surface.disabled}
              aria-current={surface.active ? 'page' : undefined}
              onClick={surface.onSelect}
            >
              <span className="studio-rail-icon" aria-hidden="true" />
              <span>{surface.label}</span>
              {!!surface.badge && <span className="studio-rail-badge">{surface.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="studio-character-strip">{characterPicker}</div>
        <div className="studio-play-content">{children}</div>
        <aside
          className={`studio-story-state${storyStateOpen ? '' : ' collapsed'}`}
          aria-label="Story State"
        >
          <header>
            <strong>Story State</strong>
            <button
              type="button"
              className="studio-story-state-toggle"
              aria-expanded={storyStateOpen}
              aria-label={storyStateOpen ? 'Collapse Story State' : 'Expand Story State'}
              title={storyStateOpen ? 'Collapse Story State' : 'Expand Story State'}
              onClick={() => setStoryStateOpen((open) => !open)}
            >
              {storyStateOpen ? '[]' : '[+]'}
            </button>
          </header>
          <div className="studio-story-state-body">
            <section>
              <strong>Character-owned surfaces</strong>
              <p>Chat, phone, gallery, socials, banking, notes, and events all belong to the fiction.</p>
            </section>
            <section>
              <strong>Graph recedes</strong>
              <p>The default experience is roleplay. Graph Mode is one click away when editing the engine.</p>
            </section>
            <section>
              <strong>No orange system</strong>
              <p>Status uses cyan active, lime complete, pink social, violet player, blue finance/app utility.</p>
            </section>
          </div>
          <div className="studio-play-footer">{composerActions}</div>
        </aside>
      </div>
    </section>
  );
}
