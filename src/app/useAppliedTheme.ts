import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ThemeManifest } from './themeTokens';
import { resolveTheme } from './themeResolver';

/** Resolves `themeId` against the loaded `manifests` and applies the result
 * as `--theme-*` custom properties directly on `rootRef`'s element, mirroring
 * the existing `--glass-opacity`/`--glass-blur` inline-style precedent —
 * imperative rather than a typed React `style` object because the resolved
 * key set is dynamic (open token dictionary), not statically known.
 *
 * Uses `useLayoutEffect` (not a passive effect) so a theme switch never
 * paints a frame of stale colors before the new theme's variables land. */
export function useAppliedTheme(
  rootRef: RefObject<HTMLElement | null>,
  themeId: string,
  manifests: ThemeManifest[],
) {
  const previousKeysRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element || manifests.length === 0) return;
    const resolved = resolveTheme(manifests, themeId);
    const nextKeys = Object.keys(resolved);

    for (const [name, value] of Object.entries(resolved)) {
      element.style.setProperty(name, value);
    }
    for (const staleKey of previousKeysRef.current) {
      if (!(staleKey in resolved)) element.style.removeProperty(staleKey);
    }
    previousKeysRef.current = nextKeys;
  }, [rootRef, themeId, manifests]);
}
