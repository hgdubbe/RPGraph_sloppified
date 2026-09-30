import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createAccountRuntime } = require('./accountRuntime.cjs');
const { runWithStorage } = require('./accountIPC.cjs');

it('routes private files only to the bound account and rejects legacy and cross-account access', async () => {
  const userDataPath = path.resolve('synthetic-user-data');
  const nativeFs = { readFile: vi.fn(async () => 'public'), writeFile: vi.fn() };
  const runtime = createAccountRuntime({ userDataPath, nativeFs });
  const abort = new AbortController();
  const view = {
    account: { id: 'test-account', alias: 'fixture', protected: true, shared: false }, signal: abort.signal,
    assertCurrent() { if (abort.signal.aborted) throw new Error('stale'); },
    list: async () => [], get: vi.fn(), put: vi.fn(), remove: vi.fn(),
  };
  await runtime.activate(view, async () => ({}));
  await expect(runtime.fs.readFile(path.join(userDataPath, 'settings.json'))).rejects.toThrow();
  await runWithStorage(view, async () => {
    const file = path.join(runtime.root(), 'settings.json');
    await runtime.fs.writeFile(file, '{}');
    expect(view.put).toHaveBeenCalled();
    expect(nativeFs.writeFile).not.toHaveBeenCalled();
    await expect(runtime.fs.readFile(path.join(runtime.root(), '..', 'other', 'settings.json'))).rejects.toThrow();
    await expect(runtime.fs.writeFile(path.resolve('external.json'), 'private')).rejects.toThrow(/export/i);
    await expect(runtime.fs.readFile(path.join(userDataPath, 'settings.json'))).rejects.toThrow(/legacy/i);
  });
  abort.abort();
  await expect(runWithStorage(view, () => runtime.fs.readFile(path.join(userDataPath, 'settings.json')))).rejects.toThrow('stale');
});
