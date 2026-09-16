// Thin compatibility shim: theme data now lives in `resources/themes/*/theme.json`
// (bundled) and the per-user themes folder (user-authored), loaded dynamically via
// `themeRegistry.ts`'s `useThemeRegistry()` hook instead of this file's previous
// hardcoded closed union. Kept as a re-export point so the storage key has one
// stable source.
export { studioThemeStorageKey } from './themeRegistry';
