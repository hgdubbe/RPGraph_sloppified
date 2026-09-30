const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
const publicNames = new Set([
  'account:list', 'account:status', 'account:create', 'account:unlock', 'account:import', 'account:recover',
  'window:minimize', 'window:toggle-maximize', 'window:toggle-full-screen', 'window:close', 'window:cleanup-complete-close',
]);
const controlNames = new Set(['account:lock', 'account:change-protection', 'account:rename', 'account:remove']);

function controlSummary(value) {
  if (value === undefined) return undefined;
  const allowed = ['id', 'alias', 'protected', 'shared', 'protectionChangePending'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((name) => !allowed.includes(name)) ||
      typeof value.id !== 'string' || typeof value.alias !== 'string' ||
      typeof value.protected !== 'boolean' || typeof value.shared !== 'boolean' ||
      (Object.hasOwn(value, 'protectionChangePending') && value.protectionChangePending !== true)) {
    throw new Error('Session control must return only a public account summary.');
  }
  return { id: value.id, alias: value.alias, protected: value.protected, shared: value.shared,
    ...(value.protectionChangePending === true ? { protectionChangePending: true } : {}) };
}

/** Host-owned classification only. Unlisted registrations require an active account. */
function createAccountIPC({ ipcMain, manager, validateSender, publicChannels = [], authorizePrivateChannel = () => {} }) {
  const publiclyAvailable = new Set(publicChannels);
  for (const channel of publiclyAvailable) {
    if (!publicNames.has(channel)) throw new Error('Unapproved public account IPC channel.');
  }
  function register(channel, callback, control = false) {
    if (typeof channel !== 'string' || !channel || typeof callback !== 'function') {
      throw new Error('Invalid account IPC registration.');
    }
    ipcMain.handle(channel, (event, ...args) => storage.run(undefined, async () => {
      if (validateSender(event) !== true) throw new Error('Invalid account IPC sender.');
      if (publiclyAvailable.has(channel)) return callback(event, ...args);
      const view = await manager.captureStorage();
      if (!control) return runWithStorage(view, async () => {
        await authorizePrivateChannel(channel);
        return callback(event, ...args);
      });
      view.assertCurrent();
      return storage.run(Object.freeze({ view }), async () => {
        try { return controlSummary(await callback(event, ...args)); }
        catch (error) { view.assertCurrent(); throw error; }
      });
    }));
  }
  return {
    currentStorage,
    runWithStorage,
    handle(channel, callback) {
      register(channel, callback);
    },
    handleSessionControl(channel, callback) {
      if (!controlNames.has(channel)) throw new Error('Unapproved session control IPC channel.');
      register(channel, callback, true);
    },
  };
}

function currentStorage() {
  const context = storage.getStore();
  if (!context) throw new Error('No account storage context.');
  context.view.assertCurrent();
  return context.view;
}

async function runWithStorage(view, task) {
  view.assertCurrent();
  return storage.run(Object.freeze({ view }), async () => {
    try {
      const result = await task();
      view.assertCurrent();
      return result;
    } catch (error) {
      view.assertCurrent();
      throw error;
    }
  });
}

module.exports = { createAccountIPC, currentStorage, runWithStorage };
