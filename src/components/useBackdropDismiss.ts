import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { usePanelNavigationOverlay } from '../navigation/usePanelNavigation';

export function useBackdropDismiss<T extends HTMLElement>(onDismiss: () => void) {
  const pointerStartedOnBackdropRef = useRef(false);
  const [backdrop, setBackdrop] = useState<T | null>(null);
  // Only a rendered backdrop participates, including conditionally mounted subdialogs.
  usePanelNavigationOverlay(onDismiss, backdrop !== null);

  return {
    ref: setBackdrop,
    onPointerDown(event: PointerEvent<T>) {
      pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
    },
    onClick(event: MouseEvent<T>) {
      const shouldDismiss = pointerStartedOnBackdropRef.current && event.target === event.currentTarget;
      pointerStartedOnBackdropRef.current = false;
      if (shouldDismiss) {
        onDismiss();
      }
    },
  };
}
