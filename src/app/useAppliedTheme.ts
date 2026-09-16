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
 * Also applies the same properties to `document.documentElement`. A few
 * components (e.g. NodeCustomSelect's dropdown popover) render via
 * `createPortal(..., document.body)`, which escapes `rootRef`'s subtree —
 * custom properties only inherit down the actual DOM tree, not through
 * React's component tree, so without this a portaled element would never
 * see a theme change. Writing to the document root is harmless for
 * everything else: nothing outside the studio UI reads `--theme-*`.
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
    const targets = [element, document.documentElement];

    for (const [name, value] of Object.entries(resolved)) {
      for (const target of targets) target.style.setProperty(name, value);
    }
    for (const staleKey of previousKeysRef.current) {
      if (!(staleKey in resolved)) {
        for (const target of targets) target.style.removeProperty(staleKey);
      }
    }
    previousKeysRef.current = nextKeys;
  }, [rootRef, themeId, manifests]);
}
