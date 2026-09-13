const path = require('node:path');

const defaultWorkflowFileNamePattern = /^workflow\.default.*\.json$/i;

// Rank the file that becomes primary/auto-activated on a fresh install (whichever sorts
// last). decision-v1 is this project's stated primary direction, so it must outrank
// planning, which must still outrank the plain original — a strict generalization of the
// old planning-only boolean: with no file matching /decision/i, this degenerates to it.
function tierOf(name) {
  if (/decision/i.test(name)) return 2;
  if (/planning/i.test(name)) return 1;
  return 0;
}

function bundledDefaultWorkflowFileNames(names) {
  return names
    .filter((name) => defaultWorkflowFileNamePattern.test(name))
    .sort((left, right) => {
      const tierDiff = tierOf(left) - tierOf(right);
      if (tierDiff !== 0) {
        return tierDiff;
      }
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function importedDefaultFileNamesFromState(state) {
  return Array.from(new Set([
    ...(Array.isArray(state?.importedDefaultFileNames)
      ? state.importedDefaultFileNames
          .filter((name) => typeof name === 'string')
          .map((name) => path.basename(name))
      : []),
    ...(typeof state?.importedDefaultFileName === 'string'
      ? [path.basename(state.importedDefaultFileName)]
      : []),
  ]));
}

async function restoreBundledDefaultWorkflows(
  bundledPaths,
  restoreWorkflow,
  activateWorkflow,
) {
  if (bundledPaths.length === 0) {
    throw new Error('No bundled default workflows are available to restore.');
  }
  const restored = [];
  for (const bundledPath of bundledPaths) {
    restored.push(await restoreWorkflow(bundledPath));
  }
  const primary = restored[restored.length - 1];
  await activateWorkflow(primary);
  return primary;
}

module.exports = {
  bundledDefaultWorkflowFileNames,
  importedDefaultFileNamesFromState,
  restoreBundledDefaultWorkflows,
};
