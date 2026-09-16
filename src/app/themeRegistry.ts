import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ThemeManifest } from './themeTokens';
import { browserThemeLibrarySnapshot } from './themeLibrary.browser';

export const studioThemeStorageKey = 'rpgraph.studioTheme' as const;

/** Kept as the initial/fallback selection so behavior matches the previous
 * hardcoded default while the registry loads asynchronously. */
export const defaultThemeId = 'studio-night';
const defaultThemeLabel = 'Studio Night';

export type ThemeRegistry = {
  /** All loaded manifests, including the hidden "base" fallback theme. */
  manifests: ThemeManifest[];
  /** Manifests minus hidden ones — what the theme picker should list. */
  selectable: ThemeManifest[];
  /** False until the first load (dev glob or IPC) resolves. */
  loaded: boolean;
  isKnownThemeId: (value: unknown) => value is string;
  themeLabel: (id: string) => string;
  /** Re-scans both theme tiers (bundled + user-authored) from disk. A no-op
   * in the browser/dev fallback, where there is no user tier to rescan. */
  reload: () => Promise<void>;
};

/** Manifests minus hidden ones, ordered by `order` ascending (undefined
 * sorts last, alphabetically among themselves) -- what the theme picker
 * should list. Exported standalone so it can be exercised directly in
 * tests without going through the React hook. */
export function selectableThemes(manifests: ThemeManifest[]): ThemeManifest[] {
  return manifests
    .filter((manifest) => !manifest.hidden)
    .sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return a.id.localeCompare(b.id);
    });
}

async function loadThemeManifests(): Promise<ThemeManifest[]> {
  const bridgeLoader = window.rpgraph?.getThemeLibrary;
  const snapshot = bridgeLoader ? await bridgeLoader() : await browserThemeLibrarySnapshot();
  return snapshot.manifests;
}

/** Loads the available themes (dev: bundled JSON via Vite glob; packaged:
 * IPC to the main process, which merges bundled presets with user-authored
 * `theme.json` files dropped into the per-user themes folder) and exposes
 * lookup helpers. Replaces the previous hardcoded `studioThemes` literal
 * array. */
export function useThemeRegistry(): ThemeRegistry {
  const [manifests, setManifests] = useState<ThemeManifest[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadThemeManifests()
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
    return window.rpgraph?.onThemeLibraryChanged?.(() => {
      void loadThemeManifests().then((loadedManifests) => {
        setManifests(loadedManifests);
        setLoaded(true);
      });
    });
  }, []);

  const selectable = useMemo(() => selectableThemes(manifests), [manifests]);

  const isKnownThemeId = useCallback(
    (value: unknown): value is string =>
      typeof value === 'string' && selectable.some((manifest) => manifest.id === value),
    [selectable],
  );

  const themeLabel = useCallback(
    (id: string) => selectable.find((manifest) => manifest.id === id)?.label ?? defaultThemeLabel,
    [selectable],
  );

  const reload = useCallback(async () => {
    if (window.rpgraph?.reloadThemeLibrary) {
      await window.rpgraph.reloadThemeLibrary();
      // The main process broadcasts theme-library:changed after a reload,
      // which the effect above also picks up; refreshing here too keeps the
      // caller's awaited promise meaningful even if that event is missed.
    }
    const loadedManifests = await loadThemeManifests();
    setManifests(loadedManifests);
    setLoaded(true);
  }, []);

  return { manifests, selectable, loaded, isKnownThemeId, themeLabel, reload };
}
