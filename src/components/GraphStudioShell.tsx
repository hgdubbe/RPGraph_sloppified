import type { ReactNode } from 'react';

export type GraphStudioShellProps = {
  toolbar: ReactNode;
  canvas: ReactNode;
  nodePalette: ReactNode;
  overlays: ReactNode;
  onOpenPlayMode: () => void;
};

export function GraphStudioShell({
  toolbar,
  canvas,
  nodePalette,
  overlays,
  onOpenPlayMode,
}: GraphStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-graph graph-panel" aria-label="Graph Mode">
      <header className="studio-graph-commandbar">
        <button type="button" className="studio-mode-button" onClick={onOpenPlayMode}>
          Play Mode
        </button>
        <div className="studio-graph-toolbar-slot">{toolbar}</div>
      </header>
      <section className="studio-graph-canvas" aria-label="Workflow Graph">
        {canvas}
      </section>
      <div className="studio-graph-palette-slot">{nodePalette}</div>
      {overlays}
    </section>
  );
}
