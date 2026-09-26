import { type ReactNode, type Ref } from 'react';

export type RoleplayStudioShellProps = {
  children: ReactNode;
  /** Wired to `.studio-play-content`, the container-query root the Context
   * Drawer's wide/narrow breakpoint and `isNarrowLayout` both key off. */
  playContentRef?: Ref<HTMLDivElement>;
};

export function RoleplayStudioShell({
  children,
  playContentRef,
}: RoleplayStudioShellProps) {
  return (
    <section className="studio-shell studio-shell-play" aria-label="Play Mode">
      <div className="studio-play-main">
        <div className="studio-play-content" ref={playContentRef}>{children}</div>
      </div>
    </section>
  );
}
