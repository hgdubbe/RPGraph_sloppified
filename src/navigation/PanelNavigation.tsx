import { useEffect, useState, type ReactNode } from 'react';
import { PanelHistory } from './panelHistory';
import { createPanelNavigationInput } from './panelNavigationInput';

import { NavigationContext } from './usePanelNavigation';

export function PanelNavigation({ children }: { children: ReactNode }) {
  const [history] = useState(() => new PanelHistory());
  useEffect(() => {
    const input = createPanelNavigationInput((direction) => history.move(direction));
    const unsubscribe = window.rpgraph?.onPanelNavigate?.(input.native);
    const mouse = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.button === 3 ? -1 : 1;
      if (event.type === 'mousedown') input.down(direction);
      if (event.type === 'mouseup') input.up(direction);
    };
    const key = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      history.move(event.key === 'ArrowLeft' ? -1 : 1);
    };
    for (const type of ['mousedown', 'mouseup', 'auxclick'] as const) window.addEventListener(type, mouse, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', input.reset);
    return () => {
      unsubscribe?.();
      for (const type of ['mousedown', 'mouseup', 'auxclick'] as const) window.removeEventListener(type, mouse, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', input.reset);
    };
  }, [history]);
  return <NavigationContext.Provider value={history}>{children}</NavigationContext.Provider>;
}
