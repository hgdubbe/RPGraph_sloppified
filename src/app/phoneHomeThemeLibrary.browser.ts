import type { PhoneHomeThemeManifest } from './phoneHomeThemeTokens';

type PhoneHomeThemeLibraryDiagnostic = {
  tier: 'bundled' | 'user';
  fileName: string;
  code: 'invalid-json' | 'invalid-manifest' | 'directory-error';
  message: string;
};

export type PhoneHomeThemeLibrarySnapshot = {
  manifests: PhoneHomeThemeManifest[];
  diagnostics: PhoneHomeThemeLibraryDiagnostic[];
};

// Keep the raw JSON glob out of the renderer entry chunk — desktop discovery
// uses IPC (see electron/phoneHomeThemeLibrary.cjs), including the
// user-authored tier; this loader only runs as the browser/vite-dev-server
// fallback when window.rpgraph is unavailable, and can only see the bundled
// presets that ship inside the repo — there is no user-writable folder to
// scan outside Electron. Mirrors `themeLibrary.browser.ts` exactly, one
// level down in scope.
const phoneHomeThemeSourceLoaders = import.meta.glob('../../resources/phone-themes/*/phone-theme.json', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

function isValidManifest(value: unknown): value is PhoneHomeThemeManifest {
  return !!value && typeof value === 'object' &&
    typeof (value as PhoneHomeThemeManifest).id === 'string' &&
    typeof (value as PhoneHomeThemeManifest).label === 'string';
}

export async function browserPhoneHomeThemeLibrarySnapshot(): Promise<PhoneHomeThemeLibrarySnapshot> {
  const manifests: PhoneHomeThemeManifest[] = [];
  const diagnostics: PhoneHomeThemeLibraryDiagnostic[] = [];
  for (const [sourcePath, load] of Object.entries(phoneHomeThemeSourceLoaders).sort(([left], [right]) => left.localeCompare(right))) {
    const fileName = sourcePath.split('/').slice(-2).join('/');
    try {
      const contents = await load();
      const parsed = JSON.parse(contents) as unknown;
      if (!isValidManifest(parsed)) {
        diagnostics.push({ tier: 'bundled', fileName, code: 'invalid-manifest', message: 'phone-theme.json is missing a required "id" or "label" field.' });
        continue;
      }
      manifests.push({ ...parsed, source: 'bundled' });
    } catch (error) {
      diagnostics.push({ tier: 'bundled', fileName, code: 'invalid-json', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { manifests, diagnostics };
}
