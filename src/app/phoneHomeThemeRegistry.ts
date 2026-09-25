import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PhoneHomeThemeManifest } from './phoneHomeThemeTokens';
import { browserPhoneHomeThemeLibrarySnapshot } from './phoneHomeThemeLibrary.browser';

/** The phone's own OS-chrome theme selection. Independent of
 * `studioThemeStorageKey`/`phoneThemeStorageKey` in `themeRegistry.ts` (the
 * rejected plain-CSS-class attempt this engine replaces) and of the
 * `phoneHome.*` theme.json namespace resolved by the Studio engine. Kept
 * under the same storage key the rejected attempt used, since it reads
 * fine and there's no reason to churn a user's saved preference. */
export const phoneHomeThemeStorageKey = 'rpgraph.phoneTheme' as const;

/** Initial/fallback selection while the registry loads asynchronously. */
export const defaultPhoneHomeThemeId = 'classic';
const defaultPhoneHomeThemeLabel = 'Classic';

export type PhoneHomeThemeRegistry = {
  /** All loaded manifests, including the hidden "base" fallback theme. */
  manifests: PhoneHomeThemeManifest[];
  /** Manifests minus hidden ones — what the phone's theme picker should list. */
  selectable: PhoneHomeThemeManifest[];
  /** False until the first load (dev glob or IPC) resolves. */
  loaded: boolean;
  isKnownThemeId: (value: unknown) => value is string;
  themeLabel: (id: string) => string;
  /** Re-scans both theme tiers (bundled + user-authored) from disk. A no-op
   * in the browser/dev fallback, where there is no user tier to rescan. */
  reload: () => Promise<void>;
};

/** Manifests minus hidden ones, ordered by `order` ascending (undefined
 * sorts last, alphabetically among themselves). Mirrors `selectableThemes`
 * in `themeRegistry.ts` exactly. */
export function selectablePhoneHomeThemes(manifests: PhoneHomeThemeManifest[]): PhoneHomeThemeManifest[] {
  return manifests
    .filter((manifest) => !manifest.hidden)
    .sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return a.id.localeCompare(b.id);
    });
}

async function loadPhoneHomeThemeManifests(): Promise<PhoneHomeThemeManifest[]> {
  const bridgeLoader = window.rpgraph?.getPhoneHomeThemeLibrary;
  const snapshot = bridgeLoader ? await bridgeLoader() : await browserPhoneHomeThemeLibrarySnapshot();
  return snapshot.manifests;
}

/** Loads the available phone-home themes (dev: bundled JSON via Vite glob;
 * packaged: IPC to the main process, which merges bundled presets with
 * user-authored `phone-theme.json` files) and exposes lookup helpers.
 * Mirrors `useThemeRegistry` exactly, one level down in scope. */
export function usePhoneHomeThemeRegistry(): PhoneHomeThemeRegistry {
  const [manifests, setManifests] = useState<PhoneHomeThemeManifest[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPhoneHomeThemeManifests()
      .then((loadedManifests) => {
        if (!cancelled) {
          setManifests(loadedManifests);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.rpgraph?.onPhoneHomeThemeLibraryChanged?.(() => {
      void loadPhoneHomeThemeManifests().then((loadedManifests) => {
        setManifests(loadedManifests);
        setLoaded(true);
      });
    });
  }, []);

  const selectable = useMemo(() => selectablePhoneHomeThemes(manifests), [manifests]);

  const isKnownThemeId = useCallback(
    (value: unknown): value is string =>
      typeof value === 'string' && selectable.some((manifest) => manifest.id === value),
    [selectable],
  );

  const themeLabel = useCallback(
    (id: string) => selectable.find((manifest) => manifest.id === id)?.label ?? defaultPhoneHomeThemeLabel,
    [selectable],
  );

  const reload = useCallback(async () => {
    if (window.rpgraph?.reloadPhoneHomeThemeLibrary) {
      await window.rpgraph.reloadPhoneHomeThemeLibrary();
      // The main process broadcasts phone-home-theme-library:changed after a
      // reload, which the effect above also picks up; refreshing here too
      // keeps the caller's awaited promise meaningful even if that event is
      // missed.
    }
    const loadedManifests = await loadPhoneHomeThemeManifests();
    setManifests(loadedManifests);
    setLoaded(true);
  }, []);

  return { manifests, selectable, loaded, isKnownThemeId, themeLabel, reload };
}
