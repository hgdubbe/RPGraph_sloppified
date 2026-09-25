const fs = require('node:fs/promises');
const path = require('node:path');

// Mirrors electron/themeLibrary.cjs exactly, one level down in scope: the
// phone's own OS-chrome theme engine's packaged-mode dual-tier loader
// (bundled `resources/phone-themes/<id>/phone-theme.json` + user
// `<userData>/phone-themes/<id>/phone-theme.json`).

function phoneHomeThemeLibraryRoots({ isPackaged, resourcesPath, projectRootPath, userDataPath }) {
  return {
    bundled: isPackaged
      ? path.join(resourcesPath, 'phone-themes')
      : path.join(projectRootPath, 'resources', 'phone-themes'),
    user: path.join(userDataPath, 'phone-themes'),
  };
}

function diagnostic(tier, fileName, code, message) {
  return { tier, fileName, code, message };
}

function isValidManifest(value) {
  return !!value && typeof value === 'object' &&
    typeof value.id === 'string' && typeof value.label === 'string';
}

async function scanPhoneHomeThemeDirectory(root, tier) {
  let directoryEntries;
  try {
    directoryEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { manifests: [], diagnostics: [] };
    return {
      manifests: [],
      diagnostics: [diagnostic('', tier, 'directory-error',
        `Unable to read the ${tier} phone-themes directory: ${error instanceof Error ? error.message : String(error)}`)],
    };
  }

  const manifests = [];
  const diagnostics = [];
  const themeDirs = directoryEntries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  for (const dir of themeDirs) {
    const fileName = path.join(dir.name, 'phone-theme.json');
    let contents;
    try {
      contents = await fs.readFile(path.join(root, dir.name, 'phone-theme.json'), 'utf8');
    } catch (error) {
      diagnostics.push(diagnostic(tier, fileName, 'directory-error',
        `Unable to read phone-theme.json: ${error instanceof Error ? error.message : String(error)}`));
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      diagnostics.push(diagnostic(tier, fileName, 'invalid-json',
        error instanceof Error ? error.message : String(error)));
      continue;
    }
    if (!isValidManifest(parsed)) {
      diagnostics.push(diagnostic(tier, fileName, 'invalid-manifest',
        'phone-theme.json is missing a required "id" or "label" field.'));
      continue;
    }
    manifests.push({ ...parsed, source: tier });
  }
  return { manifests, diagnostics };
}

/** Scans both tiers and merges by id, user-authored themes overriding a
 * bundled theme of the same id. */
async function scanPhoneHomeThemeLibrary(roots) {
  const bundled = await scanPhoneHomeThemeDirectory(roots.bundled, 'bundled');
  const user = await scanPhoneHomeThemeDirectory(roots.user, 'user');
  const byId = new Map();
  for (const manifest of [...bundled.manifests, ...user.manifests]) byId.set(manifest.id, manifest);
  return {
    roots,
    manifests: [...byId.values()],
    diagnostics: [...bundled.diagnostics, ...user.diagnostics],
  };
}

/** Mirrors `createThemeLibraryService` exactly. */
function createPhoneHomeThemeLibraryService({ roots, openPath, onChanged = () => {} }) {
  let cached = { roots, manifests: [], diagnostics: [] };
  let queue = Promise.resolve();
  function enqueue(action) {
    const next = queue.then(action);
    queue = next.catch(() => {});
    return next;
  }
  const service = {
    current: () => cached,
    reload: () => enqueue(async () => {
      try {
        await fs.mkdir(roots.user, { recursive: true });
      } catch {
        // The scan below returns a directory diagnostic without blocking startup.
      }
      cached = await scanPhoneHomeThemeLibrary(roots);
      onChanged(cached);
      return cached;
    }),
    openUserDirectory: async () => {
      await fs.mkdir(roots.user, { recursive: true });
      const error = await openPath(roots.user);
      if (error) throw new Error(`Unable to open the phone-themes directory: ${error}`);
      return { path: roots.user };
    },
  };
  return service;
}

module.exports = { phoneHomeThemeLibraryRoots, createPhoneHomeThemeLibraryService };
