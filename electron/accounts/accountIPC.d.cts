import type { AccountStorageView } from './accountManager.cjs';

export type PublicAccountChannel = 'account:list' | 'account:status' | 'account:create' |
  'account:unlock' | 'account:import' | 'account:recover' | 'window:minimize' |
  'window:toggle-maximize' | 'window:toggle-full-screen' | 'window:close' | 'window:cleanup-complete-close';

export interface AccountIPC<Event = unknown> {
  /** Public only when included in the validated host allowlist; otherwise authenticated. */
  handle<Args extends unknown[], Result>(channel: string, callback: (event: Event, ...args: Args) => Result | Promise<Result>): void;
  /**
   * Fixed lifecycle channels only. Captures auth first, allows the handler to lock,
   * and returns only undefined or a validated public account summary. The host
   * must constrain any target account ID to currentStorage().account.id and
   * perform password/confirmation checks; this API does not authorize an ID.
   */
  handleSessionControl<Args extends unknown[], Result>(channel: string, callback: (event: Event, ...args: Args) => Result | Promise<Result>): void;
  currentStorage: typeof currentStorage;
  runWithStorage: typeof runWithStorage;
}

export function createAccountIPC<Event = unknown>(options: {
  ipcMain: { handle(channel: string, callback: (event: Event, ...args: unknown[]) => Promise<unknown>): unknown };
  manager: { captureStorage(): Promise<AccountStorageView> };
  /** Must synchronously validate the sender frame/window/origin and return true. */
  validateSender(event: Event): boolean;
  /** Copied once; no renderer-supplied classifications. Empty means all private. */
  publicChannels?: Iterable<string>;
  /** Host policy, evaluated only for private handlers within their account scope. */
  authorizePrivateChannel?(channel: string): void | Promise<void>;
}): AccountIPC<Event>;

/** Fails outside a bound scope or after its original session becomes stale. */
export function currentStorage(): AccountStorageView;
/** Main-owned background work: validates before task and again before returning. */
export function runWithStorage<T>(view: AccountStorageView, task: () => T | Promise<T>): Promise<T>;
