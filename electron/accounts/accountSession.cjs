/** Main-process authority only. Never expose this service or its leases over IPC. */
function createAccountSession() {
  let state = 'locked';
  let epoch = 0;
  let current;
  function assertCurrent(lease) {
    if (state !== 'active' || lease !== current.lease) {
      throw new Error('Account session is locked or stale.');
    }
  }
  return {
    get state() { return state; },
    get epoch() { return epoch; },
    activate({ accountId, root }) {
      if (state !== 'locked') throw new Error('Account session is not locked.');
      if ([accountId, root].some((value) => typeof value !== 'string' || !value || value.includes('\0'))) {
        throw new Error('Invalid account session identity.');
      }
      current = {
        accountId, root, lease: Object.freeze({}), controller: new AbortController(),
        drainController: new AbortController(), queue: Promise.resolve(),
      };
      epoch += 1;
      state = 'active';
      return current.lease;
    },
    capture() {
      if (state !== 'active') throw new Error('Account session is locked.');
      return current.lease;
    },
    assertCurrent,
    signal(lease) {
      assertCurrent(lease);
      return current.controller.signal;
    },
    enqueuePrepared(lease, commit) {
      assertCurrent(lease);
      const captured = current;
      let running = false;
      const context = Object.freeze({
        accountId: captured.accountId,
        root: captured.root,
        signal: captured.drainController.signal,
        assertCanCommit() {
          if (!running || current !== captured || captured.drainController.signal.aborted) {
            throw new Error('Account commit was revoked.');
          }
        },
      });
      const operation = captured.queue.then(async () => {
        running = true;
        try {
          context.assertCanCommit();
          return await commit(context);
        } finally {
          running = false;
        }
      });
      captured.queue = operation.catch(() => {});
      return operation;
    },
    lock({ timeoutMs = 5000 } = {}) {
      if (state === 'locked') return Promise.resolve();
      if (state === 'locking') return current.lockPromise;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
        throw new Error('Invalid account lock timeout.');
      }
      const captured = current;
      state = 'locking';
      epoch += 1;
      captured.lockPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          captured.drainController.abort();
          reject(new Error('Account lock drain timed out; pending writes are still isolated.'));
        }, timeoutMs);
        captured.queue.then(() => {
          clearTimeout(timer);
          captured.drainController.abort();
          current = undefined;
          state = 'locked';
          resolve();
        });
      });
      captured.controller.abort();
      return captured.lockPromise;
    },
  };
}

module.exports = { createAccountSession };
