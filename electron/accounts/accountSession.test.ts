import { expect, it, vi } from 'vitest';
import { createAccountSession } from './accountSession.cjs';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it('starts locked and issues an opaque authority for one active account', () => {
  const session = createAccountSession();
  expect(session.state).toBe('locked');
  expect(() => session.capture()).toThrow('locked');
  const lease = session.activate({ accountId: 'a', root: '/synthetic/a' });
  expect(session.state).toBe('active');
  expect(session.capture()).toBe(lease);
  expect(Object.keys(lease)).toEqual([]);
  expect(() => session.assertCurrent(lease)).not.toThrow();
  expect(() => session.activate({ accountId: 'b', root: '/synthetic/b' })).toThrow();
});

it('rejects invalid account identity before creating authority', () => {
  const session = createAccountSession();
  expect(() => session.activate({ accountId: '', root: '/synthetic/a' })).toThrow('Invalid');
  expect(() => session.activate({ accountId: 'a', root: '' })).toThrow('Invalid');
  expect(() => session.activate({ accountId: 'a', root: '/synthetic/\0a' })).toThrow('Invalid');
  expect(session.state).toBe('locked');
});

it('expires each prepared commit capability when its callback settles without poisoning the queue', async () => {
  const session = createAccountSession();
  const lease = session.activate({ accountId: 'a', root: '/synthetic/a' });
  let assertExpired!: () => void;
  await expect(session.enqueuePrepared(lease, async (context) => {
    assertExpired = context.assertCanCommit;
    throw new Error('synthetic write failure');
  })).rejects.toThrow('synthetic write failure');
  expect(() => assertExpired()).toThrow('revoked');
  const result = await session.enqueuePrepared(lease, async (context) => {
    context.assertCanCommit();
    return 'saved';
  });
  expect(result).toBe('saved');
  await session.lock();
});

it('bounds lock waiting without allowing a new account while a noncooperative write still runs', async () => {
  vi.useFakeTimers();
  try {
    const session = createAccountSession();
    const lease = session.activate({ accountId: 'a', root: '/synthetic/a' });
    const started = deferred();
    const paused = deferred();
    let drainSignal!: AbortSignal;
    const first = session.enqueuePrepared(lease, async (context) => {
      drainSignal = context.signal;
      started.resolve();
      await paused.promise;
      context.assertCanCommit();
    });
    const rejectedWrite = expect(first).rejects.toThrow('revoked');
    const later = vi.fn();
    const queued = session.enqueuePrepared(lease, later);
    const rejectedQueued = expect(queued).rejects.toThrow('revoked');
    await started.promise;
    const locked = session.lock({ timeoutMs: 10 });
    const timedOut = expect(locked).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10);
    await timedOut;
    expect(drainSignal.aborted).toBe(true);
    expect(session.state).toBe('locking');
    expect(() => session.activate({ accountId: 'b', root: '/synthetic/b' })).toThrow();
    paused.resolve();
    await Promise.all([rejectedWrite, rejectedQueued]);
    await vi.runAllTimersAsync();
    expect(session.state).toBe('locked');
    expect(later).not.toHaveBeenCalled();
    session.activate({ accountId: 'b', root: '/synthetic/b' });
  } finally {
    vi.useRealTimers();
  }
});

it('drains prepared writes in order against the captured root before allowing another account', async () => {
  const session = createAccountSession();
  const input = { accountId: 'a', root: '/synthetic/a' };
  const lease = session.activate(input);
  input.root = '/synthetic/b';
  const paused = deferred();
  const started = deferred();
  const order: string[] = [];
  const first = session.enqueuePrepared(lease, async (context) => {
    order.push('first');
    started.resolve();
    await paused.promise;
    context.assertCanCommit();
    expect(context.root).toBe('/synthetic/a');
    expect(context.accountId).toBe('a');
    order.push('published');
  });
  const second = session.enqueuePrepared(lease, async (context) => {
    context.assertCanCommit();
    order.push('second');
  });
  await started.promise;
  const locked = session.lock();
  expect(session.state).toBe('locking');
  expect(() => session.activate({ accountId: 'b', root: '/synthetic/b' })).toThrow();
  expect(() => session.enqueuePrepared(lease, async () => {})).toThrow();
  expect(order).toEqual(['first']);
  paused.resolve();
  await Promise.all([first, second, locked]);
  expect(order).toEqual(['first', 'published', 'second']);
  expect(session.state).toBe('locked');
  session.activate({ accountId: 'b', root: '/synthetic/b' });
});

it('revokes leases and work immediately on lock, and never accepts forged or old authority', async () => {
  const session = createAccountSession();
  const lease = session.activate({ accountId: 'a', root: '/synthetic/a' });
  const epoch = session.epoch;
  const signal = session.signal(lease);
  expect(() => session.assertCurrent({ ...lease })).toThrow();
  const locked = session.lock();
  expect(signal.aborted).toBe(true);
  expect(session.epoch).toBeGreaterThan(epoch);
  expect(() => session.assertCurrent(lease)).toThrow();
  await locked;
  expect(session.state).toBe('locked');
  const next = session.activate({ accountId: 'a', root: '/synthetic/a' });
  expect(next).not.toBe(lease);
  expect(() => session.assertCurrent(lease)).toThrow();
  expect(() => session.assertCurrent(next)).not.toThrow();
});

it('returns the same lock promise to a reentrant abort listener and repeated callers', async () => {
  const session = createAccountSession();
  const lease = session.activate({ accountId: 'a', root: '/synthetic/a' });
  let reentrant: Promise<void> | undefined;
  let observed: string | undefined;
  session.signal(lease).addEventListener('abort', () => {
    observed = session.state;
    reentrant = session.lock();
  });
  const locked = session.lock();
  expect(observed).toBe('locking');
  expect(reentrant).toBe(locked);
  expect(session.lock()).toBe(locked);
  await locked;
  expect(session.state).toBe('locked');
});

it('rejects invalid lock deadlines without revoking the active session', async () => {
  const session = createAccountSession();
  const lease = session.activate({ accountId: 'a', root: '/synthetic/a' });
  const signal = session.signal(lease);
  const epoch = session.epoch;
  try {
    for (const timeoutMs of [0, -1, 60001, 1.5, Number.NaN]) {
      expect(() => session.lock({ timeoutMs })).toThrow('timeout');
      expect(session.state).toBe('active');
      expect(session.epoch).toBe(epoch);
      expect(signal.aborted).toBe(false);
      expect(session.capture()).toBe(lease);
    }
  } finally {
    await session.lock();
  }
});

it('rejects publishing an old asynchronous result after a different account is activated', async () => {
  const session = createAccountSession();
  const oldLease = session.activate({ accountId: 'a', root: '/synthetic/a' });
  const pending = deferred();
  const publish = vi.fn();
  const operation = pending.promise.then(() => {
    session.assertCurrent(oldLease);
    publish('synthetic private result');
  });
  await session.lock();
  session.activate({ accountId: 'b', root: '/synthetic/b' });
  const rejected = expect(operation).rejects.toThrow('stale');
  pending.resolve();
  await rejected;
  expect(publish).not.toHaveBeenCalled();
  await session.lock();
});
