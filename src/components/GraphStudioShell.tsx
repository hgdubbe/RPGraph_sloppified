import type { ReactNode } from 'react';

export type GraphStudioShellProps = {
  toolbar: ReactNode;
  canvas: ReactNode;
  canvasHud: ReactNode;
  nodePalette: ReactNode;
  inspector: ReactNode;
  overlays: ReactNode;
  inspectorCollapsed?: boolean;
  onOpenPlayMode: () => void;
};

export function GraphStudioShell({
  toolbar,
  canvas,
  canvasHud,
  nodePalette,
  inspector,
  overlays,
  inspectorCollapsed = false,
  onOpenPlayMode,
}: GraphStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-graph graph-panel" aria-label="Graph Mode">
      <header className="studio-graph-commandbar">
        <div className="studio-graph-mode-stack">
          <button type="button" className="studio-mode-button" onClick={onOpenPlayMode}>
            Play Mode
          </button>
          <span className="studio-graph-mode-label">Graph</span>
        </div>
        <div className="studio-graph-toolbar-slot">{toolbar}</div>
      </header>
      <section className={`studio-graph-workbench${inspectorCollapsed ? ' inspector-collapsed' : ''}`}>
        <div className="studio-graph-palette-slot">{nodePalette}</div>
        <section className="studio-graph-canvas" aria-label="Workflow Graph">
          <div className="studio-graph-canvas-hud">{canvasHud}</div>
          {canvas}
        </section>
        <div className="studio-graph-inspector-slot">{inspector}</div>
      </section>
      {overlays}
    </section>
  );
}
