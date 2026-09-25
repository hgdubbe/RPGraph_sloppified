import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PhoneHomeThemeManifest } from './phoneHomeThemeTokens';
import { resolvePhoneHomeTheme } from './phoneHomeThemeResolver';

/** Resolves `themeId` against the loaded `manifests` and applies the result
 * as `--theme-phone-home-*` custom properties directly on `rootRef`'s
 * element — mirrors `useAppliedTheme.ts`'s `useLayoutEffect`+stale-key-
 * cleanup pattern exactly, with one deliberate difference: this hook is
 * applied ONLY to the `.roleplay-phone-device` element, never to
 * `document.documentElement`.
 *
 * This is load-bearing, not an oversight: the phone must never bleed the
 * Studio's active theme into its own chrome, and vice versa. Writing to
 * `document.documentElement` (as `useAppliedTheme` does, to reach portaled
 * dropdowns that escape its own root's subtree) would leak the phone's
 * theme choice back out to the rest of the Studio app. `.roleplay-phone-
 * device` sits deeper in the DOM than `document.documentElement`, and every
 * consumer of these tokens — the status bar, home button, screen, and the
 * portaled tray menus (`RoleplayPhoneDevice`'s overlay layer renders as a
 * literal DOM descendant of `.roleplay-phone-device`, not via
 * `createPortal` to `document.body`) — is a genuine DOM descendant of it,
 * so setting the vars there is sufficient for every consumer.
 *
 * Uses `useLayoutEffect` (not a passive effect) so a theme switch never
 * paints a frame of stale colors before the new theme's variables land. */
export function useAppliedPhoneHomeTheme(
  rootRef: RefObject<HTMLElement | null>,
  themeId: string,
  manifests: PhoneHomeThemeManifest[],
) {
  const previousKeysRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element || manifests.length === 0) return;
    const resolved = resolvePhoneHomeTheme(manifests, themeId);
    const nextKeys = Object.keys(resolved);

    for (const [name, value] of Object.entries(resolved)) {
      element.style.setProperty(name, value);
    }
    for (const staleKey of previousKeysRef.current) {
      if (!(staleKey in resolved)) {
        element.style.removeProperty(staleKey);
      }
    }
    previousKeysRef.current = nextKeys;
  }, [rootRef, themeId, manifests]);
}
