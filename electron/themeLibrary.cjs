const fs = require('node:fs/promises');
const path = require('node:path');

function themeLibraryRoots({ isPackaged, resourcesPath, projectRootPath, userDataPath }) {
  return {
    bundled: isPackaged
      ? path.join(resourcesPath, 'themes')
      : path.join(projectRootPath, 'resources', 'themes'),
    user: path.join(userDataPath, 'themes'),
  };
}

function diagnostic(tier, fileName, code, message) {
  return { tier, fileName, code, message };
}

function isValidManifest(value) {
  return !!value && typeof value === 'object' &&
    typeof value.id === 'string' && typeof value.label === 'string';
}

async function scanThemeDirectory(root, tier) {
  let directoryEntries;
  try {
    directoryEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { manifests: [], diagnostics: [] };
    return {
      manifests: [],
      diagnostics: [diagnostic('', tier, 'directory-error',
        `Unable to read the ${tier} themes directory: ${error instanceof Error ? error.message : String(error)}`)],
    };
  }

  const manifests = [];
  const diagnostics = [];
  const themeDirs = directoryEntries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  for (const dir of themeDirs) {
    const fileName = path.join(dir.name, 'theme.json');
    let contents;
    try {
      contents = await fs.readFile(path.join(root, dir.name, 'theme.json'), 'utf8');
    } catch (error) {
      diagnostics.push(diagnostic(tier, fileName, 'directory-error',
        `Unable to read theme.json: ${error instanceof Error ? error.message : String(error)}`));
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
        'theme.json is missing a required "id" or "label" field.'));
      continue;
    }
    manifests.push({ ...parsed, source: tier });
  }
  return { manifests, diagnostics };
}

/** Scans both tiers and merges by id, user-authored themes overriding a
 * bundled theme of the same id (so a user can safely fork/tweak a preset
 * without editing the installed app). */
async function scanThemeLibrary(roots) {
  const bundled = await scanThemeDirectory(roots.bundled, 'bundled');
  const user = await scanThemeDirectory(roots.user, 'user');
  const byId = new Map();
  for (const manifest of [...bundled.manifests, ...user.manifests]) byId.set(manifest.id, manifest);
  return {
    roots,
    manifests: [...byId.values()],
    diagnostics: [...bundled.diagnostics, ...user.diagnostics],
  };
}

/** Mirrors `createNpcLibraryService` in `npcLibrary.cjs`: cached snapshot,
 * serialized reloads, and an "open the user folder" affordance so users can
 * find where to drop a hand-authored `theme.json`. */
function createThemeLibraryService({ roots, openPath, onChanged = () => {} }) {
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
      cached = await scanThemeLibrary(roots);
      onChanged(cached);
      return cached;
    }),
    openUserDirectory: async () => {
      await fs.mkdir(roots.user, { recursive: true });
      const error = await openPath(roots.user);
      if (error) throw new Error(`Unable to open the themes directory: ${error}`);
      return { path: roots.user };
    },
  };
  return service;
}

module.exports = { themeLibraryRoots, createThemeLibraryService };
