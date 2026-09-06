const fs = require('node:fs/promises');
const path = require('node:path');

function diagnosticsPath(options = {}) {
  const directory = options.directory;
  if (!directory) {
    throw new Error('Crash diagnostics directory is required.');
  }
  return path.join(directory, 'crash-diagnostics.json');
}

async function readRecentCrashDiagnostics(options = {}) {
  try {
    const contents = await fs.readFile(diagnosticsPath(options), 'utf8');
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function appendDiagnosticLog(kind, details = {}, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const filePath = diagnosticsPath(options);
  const records = await readRecentCrashDiagnostics(options);
  records.push({
    kind: String(kind),
    details,
    createdAt: new Date().toISOString(),
  });
  const nextRecords = records.slice(-limit);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(nextRecords, null, 2)}\n`, 'utf8');
}

function registerCrashDiagnostics(app, window) {
  const options = { directory: app.getPath('userData') };

  window.webContents.on('render-process-gone', (_event, details) => {
    void appendDiagnosticLog('render-process-gone', details, options);
  });

  window.on('unresponsive', () => {
    void appendDiagnosticLog('window-unresponsive', {}, options);
  });

  window.on('responsive', () => {
    void appendDiagnosticLog('window-responsive', {}, options);
  });

  app.on('child-process-gone', (_event, details) => {
    void appendDiagnosticLog('child-process-gone', details, options);
  });
}

module.exports = {
  appendDiagnosticLog,
  readRecentCrashDiagnostics,
  registerCrashDiagnostics,
};
