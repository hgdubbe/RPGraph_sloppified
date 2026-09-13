const fs = require('node:fs/promises');
const path = require('node:path');

// Durable record of real effects (WhatsUp sends, image generations) attempted through
// the shared actions-v1/staged-v1 executor, so a crash between "effect fired" and "turn
// committed" cannot silently lose all evidence of it. Plain JSON, no encryption layer,
// matching crash diagnostics' own simplicity — this is operational metadata, not story
// content. Reconciliation/retry is not implemented here; see H7 in the roadmap.

function journalPath(options = {}) {
  const directory = options.directory;
  if (!directory) {
    throw new Error('Effect journal directory is required.');
  }
  return path.join(directory, 'effect-journal.rpgraph.json');
}

function sameScope(a, b) {
  return !!a && !!b && a.saveId === b.saveId && a.branchId === b.branchId && a.turnId === b.turnId;
}

async function readEffectJournal(options = {}) {
  try {
    const contents = await fs.readFile(journalPath(options), 'utf8');
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeEffectJournal(entries, options = {}) {
  const filePath = journalPath(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

async function recordEffectAttempt(entry, options = {}) {
  const entries = await readEffectJournal(options);
  const next = entries.filter((existing) => existing.operationId !== entry.operationId);
  next.push({ ...entry, status: 'pending', recordedAt: new Date().toISOString() });
  await writeEffectJournal(next, options);
}

async function recordEffectOutcome(operationId, outcome, options = {}) {
  const entries = await readEffectJournal(options);
  const next = entries.map((existing) =>
    existing.operationId === operationId
      ? { ...existing, ...outcome, recordedAt: new Date().toISOString() }
      : existing,
  );
  await writeEffectJournal(next, options);
}

async function clearEffectJournalForScope(scope, options = {}) {
  const entries = await readEffectJournal(options);
  const next = entries.filter((existing) => !sameScope(existing.scope, scope));
  if (next.length !== entries.length) {
    await writeEffectJournal(next, options);
  }
}

async function clearAllEffectJournal(options = {}) {
  await writeEffectJournal([], options);
}

module.exports = {
  readEffectJournal,
  recordEffectAttempt,
  recordEffectOutcome,
  clearEffectJournalForScope,
  clearAllEffectJournal,
};
