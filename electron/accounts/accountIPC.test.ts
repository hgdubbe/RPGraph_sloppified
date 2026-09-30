import { expect, it, vi } from 'vitest';
import { createAccountIPC, currentStorage, runWithStorage } from './accountIPC.cjs';

function fixture() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const ipcMain = { handle: (channel: string, callback: (event: unknown, ...args: unknown[]) => Promise<unknown>) => handlers.set(channel, callback) };
  const manager = { captureStorage: vi.fn() };
  const dispatcher = createAccountIPC({ ipcMain, manager, validateSender: () => true, publicChannels: ['account:list'] });
  return { handlers, manager, dispatcher, invoke: (channel: string) => handlers.get(channel)!({}) };
}

function view(id: string) {
  const abort = new AbortController();
  const storage = {
    account: { id, alias: id, protected: true, shared: false }, signal: abort.signal,
    assertCurrent() { if (abort.signal.aborted) throw new Error('stale account'); },
    list: async () => [], get: async () => Buffer.alloc(0), put: vi.fn(async () => {}), remove: vi.fn(async () => {}),
  };
  return { storage, revoke: () => abort.abort() };
}

it('validates every sender before even public handlers and rejects unapproved public classifications', async () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const ipcMain = { handle: (channel: string, callback: (event: unknown, ...args: unknown[]) => Promise<unknown>) => handlers.set(channel, callback) };
  const manager = { captureStorage: vi.fn() };
  const validateSender = vi.fn(() => false);
  const dispatcher = createAccountIPC({ ipcMain, manager, validateSender, publicChannels: ['account:list'] });
  const handler = vi.fn();
  dispatcher.handle('account:list', handler);
  await expect(handlers.get('account:list')!({ forged: true })).rejects.toThrow('sender');
  expect(handler).not.toHaveBeenCalled();
  expect(manager.captureStorage).not.toHaveBeenCalled();
  expect(() => createAccountIPC({ ipcMain, manager, validateSender, publicChannels: ['settings:load'] })).toThrow('public');
});

it('suppresses late private error details as well as successful replies', async () => {
  const a = view('a');
  await expect(runWithStorage(a.storage, async () => {
    await Promise.resolve();
    a.revoke();
    throw new Error('private story content from the old session');
  })).rejects.toThrow('stale');
});

it('allows fixed authenticated lifecycle controls to invalidate their lease but rejects private response fields', async () => {
  const { manager, dispatcher, invoke } = fixture();
  const a = view('a');
  manager.captureStorage.mockResolvedValue(a.storage);
  expect(() => dispatcher.handleSessionControl('settings:load', () => {})).toThrow('control');
  dispatcher.handleSessionControl('account:lock', () => {
    expect(currentStorage().signal).toBe(a.storage.signal);
    a.revoke();
  });
  await expect(invoke('account:lock')).resolves.toBeUndefined();
  const b = view('b');
  manager.captureStorage.mockResolvedValue(b.storage);
  dispatcher.handleSessionControl('account:rename', () => {
    b.revoke();
    return { ...b.storage.account, privateStory: 'must not return' };
  });
  await expect(invoke('account:rename')).rejects.toThrow('stale');
  const c = view('c');
  manager.captureStorage.mockResolvedValue(c.storage);
  dispatcher.handleSessionControl('account:remove', () => ({ ...c.storage.account, privateStory: 'must not return' }));
  await expect(invoke('account:remove')).rejects.toThrow('public account summary');
});

it('public dispatch has no inherited private storage authority and copies host classification', async () => {
  const handlers = new Map<string, (event: unknown) => Promise<unknown>>();
  const publicChannels = ['account:list'];
  const manager = { captureStorage: vi.fn().mockRejectedValue(new Error('locked')) };
  const dispatcher = createAccountIPC({
    ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
    manager, validateSender: () => true, publicChannels,
  });
  publicChannels.push('settings:load');
  dispatcher.handle('settings:load', () => 'private');
  await expect(handlers.get('settings:load')!({})).rejects.toThrow('locked');
  dispatcher.handle('account:list', () => { expect(() => currentStorage()).toThrow('context'); return []; });
  await runWithStorage(view('a').storage, async () => {
    await expect(handlers.get('account:list')!({})).resolves.toEqual([]);
    expect(currentStorage().account.id).toBe('a');
  });
});

it('rejects late replies from A after locking and cannot write through A context into B', async () => {
  const { manager, dispatcher, invoke } = fixture();
  const a = view('a');
  const b = view('b');
  manager.captureStorage.mockResolvedValue(a.storage);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const paused = new Promise<void>((resolve) => { release = resolve; });
  let delayedWrite!: () => Promise<void>;
  dispatcher.handle('settings:load', async () => {
    delayedWrite = async () => { await paused; await currentStorage().put({ objectId: 'synthetic', type: 'settings', data: Buffer.alloc(0) }); };
    const write = delayedWrite();
    const refusedWrite = expect(write).rejects.toThrow('stale');
    started();
    await paused;
    await refusedWrite;
    return 'private-a-reply';
  });
  const response = invoke('settings:load');
  const refusedReply = expect(response).rejects.toThrow('stale');
  await entered;
  a.revoke();
  manager.captureStorage.mockResolvedValue(b.storage);
  release();
  await refusedReply;
  expect(a.storage.put).not.toHaveBeenCalled();
  expect(b.storage.put).not.toHaveBeenCalled();
});

it('defaults private registrations to locked denial and binds storage through asynchronous handlers', async () => {
  const { manager, dispatcher, invoke } = fixture();
  const handler = vi.fn(async () => { await Promise.resolve(); return currentStorage().account.id; });
  dispatcher.handle('settings:load', handler);
  manager.captureStorage.mockRejectedValueOnce(new Error('locked'));
  await expect(invoke('settings:load')).rejects.toThrow('locked');
  expect(handler).not.toHaveBeenCalled();
  const account = view('a');
  manager.captureStorage.mockResolvedValue(account.storage);
  await expect(invoke('settings:load')).resolves.toBe('a');
  expect(() => currentStorage()).toThrow('context');
});
