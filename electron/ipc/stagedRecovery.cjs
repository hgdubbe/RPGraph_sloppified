const fs = require('node:fs/promises');
const path = require('node:path');

// Durable record of one interrupted staged-v1 turn per RP save file, so a failed turn's
// compiled plan/store/completed-stage state survives an app restart instead of only
// living in memory for the lifetime of the run (S8 restart-recovery groundwork; see
// docs/handoff/2026-09-12-s8-restart-reconciliation-scoping.md). Plain JSON, no
// encryption layer, matching the effect journal's own simplicity. `sessionFileName` is
// the actual RP save file's name — the one stable identity available for "the same
// conversation," unlike the ephemeral per-run scope staged workflow otherwise uses.
// The original failure's `error` string travels alongside `retry` so a resume-on-launch
// prompt has something real to show (see App.tsx's checkStagedRecoveryForSession, which
// consumes this record). This module itself only makes the record durable and queryable.

function stagedRecoveryPath(options = {}) {
  const directory = options.directory;
  if (!directory) {
    throw new Error('Staged recovery directory is required.');
  }
  return path.join(directory, 'staged-recovery.rpgraph.json');
}

async function readStagedRecoveryEntries(options = {}) {
  try {
    const contents = await fs.readFile(stagedRecoveryPath(options), 'utf8');
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeStagedRecoveryEntries(entries, options = {}) {
  const filePath = stagedRecoveryPath(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

async function readStagedRecoveryForSession(sessionFileName, options = {}) {
  const entries = await readStagedRecoveryEntries(options);
  return entries.find((entry) => entry.sessionFileName === sessionFileName) ?? null;
}

async function writeStagedRecoveryForSession(sessionFileName, retry, error, options = {}) {
  const entries = await readStagedRecoveryEntries(options);
  const next = entries.filter((entry) => entry.sessionFileName !== sessionFileName);
  next.push({ sessionFileName, retry, error, recordedAt: new Date().toISOString() });
  await writeStagedRecoveryEntries(next, options);
}

async function clearStagedRecoveryForSession(sessionFileName, options = {}) {
  const entries = await readStagedRecoveryEntries(options);
  const next = entries.filter((entry) => entry.sessionFileName !== sessionFileName);
  if (next.length !== entries.length) {
    await writeStagedRecoveryEntries(next, options);
  }
}

module.exports = {
  readStagedRecoveryForSession,
  writeStagedRecoveryForSession,
  clearStagedRecoveryForSession,
};
