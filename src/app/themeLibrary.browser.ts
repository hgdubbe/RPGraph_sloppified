import type { ThemeManifest } from './themeTokens';

type ThemeLibraryDiagnostic = {
  tier: 'bundled' | 'user';
  fileName: string;
  code: 'invalid-json' | 'invalid-manifest' | 'directory-error';
  message: string;
};

export type ThemeLibrarySnapshot = {
  manifests: ThemeManifest[];
  diagnostics: ThemeLibraryDiagnostic[];
};

// Keep the raw JSON glob out of the renderer entry chunk — desktop discovery
// uses IPC (see electron/themeLibrary.cjs), including the user-authored
// tier; this loader only runs as the browser/vite-dev-server fallback when
// window.rpgraph is unavailable, and can only see the bundled presets that
// ship inside the repo — there is no user-writable folder to scan outside
// Electron.
const themeSourceLoaders = import.meta.glob('../../resources/themes/*/theme.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

function isValidManifest(value: unknown): value is ThemeManifest {
  return !!value && typeof value === 'object' &&
    typeof (value as ThemeManifest).id === 'string' &&
    typeof (value as ThemeManifest).label === 'string';
}

export async function browserThemeLibrarySnapshot(): Promise<ThemeLibrarySnapshot> {
  const manifests: ThemeManifest[] = [];
  const diagnostics: ThemeLibraryDiagnostic[] = [];
  for (const [sourcePath, load] of Object.entries(themeSourceLoaders).sort(([left], [right]) => left.localeCompare(right))) {
    const fileName = sourcePath.split('/').slice(-2).join('/');
    try {
      const contents = await load();
      const parsed = JSON.parse(contents) as unknown;
      if (!isValidManifest(parsed)) {
        diagnostics.push({ tier: 'bundled', fileName, code: 'invalid-manifest', message: 'theme.json is missing a required "id" or "label" field.' });
        continue;
      }
      manifests.push({ ...parsed, source: 'bundled' });
    } catch (error) {
      diagnostics.push({ tier: 'bundled', fileName, code: 'invalid-json', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { manifests, diagnostics };
}
