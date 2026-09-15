import type { ReactNode } from 'react';

export type GraphStudioShellProps = {
  toolbar: ReactNode;
  canvas: ReactNode;
  canvasHud: ReactNode;
  nodePalette: ReactNode;
  inspector: ReactNode;
  overlays: ReactNode;
  paletteCollapsed?: boolean;
  inspectorCollapsed?: boolean;
};

export function GraphStudioShell({
  toolbar,
  canvas,
  canvasHud,
  nodePalette,
  inspector,
  overlays,
  paletteCollapsed = false,
  inspectorCollapsed = false,
}: GraphStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-graph graph-panel" aria-label="Graph Mode">
      <header className="studio-graph-commandbar">
        <div className="studio-graph-toolbar-slot">{toolbar}</div>
      </header>
      <section
        className={[
          'studio-graph-workbench',
          paletteCollapsed ? 'palette-collapsed' : '',
          inspectorCollapsed ? 'inspector-collapsed' : '',
        ].filter(Boolean).join(' ')}
      >
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
