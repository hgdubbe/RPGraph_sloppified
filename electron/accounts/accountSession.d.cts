declare const accountLeaseBrand: unique symbol;
/** Identity capability held only by the main process; never serialize through IPC. */
export type AccountLease = Readonly<{ [accountLeaseBrand]: true }>;

export interface PreparedAccountCommit {
  readonly accountId: string;
  readonly root: string;
  /** Aborted when the drain deadline expires or the session finishes locking. */
  readonly signal: AbortSignal;
  /** Call immediately before publication; valid only until this callback settles. */
  assertCanCommit(): void;
}

export interface AccountSession {
  readonly state: 'locked' | 'active' | 'locking';
  readonly epoch: number;
  /** Caller must authenticate and resolve/validate the canonical root first. */
  activate(identity: { accountId: string; root: string }): AccountLease;
  capture(): AccountLease;
  assertCurrent(lease: AccountLease): void;
  /** Ordinary work is aborted immediately when locking begins. */
  signal(lease: AccountLease): AbortSignal;
  /**
   * Accept an already-prepared main-process commit. Never enqueue network work or
   * capture mutable current-account globals. Return/await all IO in the callback.
   * The result belongs to this caller; check assertCurrent before sending to UI.
   * A write failure rejects its own promise but does not poison later writes.
   */
  enqueuePrepared<T>(lease: AccountLease, commit: (context: PreparedAccountCommit) => Promise<T> | T): Promise<T>;
  /**
   * Immediately revoke ordinary authority, then drain accepted commits.
   * Timeout (1..60000ms, default 5000) rejects and aborts the drain signal but
   * stays LOCKING until all IO callbacks settle: it never pretends to cancel IO.
   * Repeated calls during locking return the same promise; no deadline reset.
   * Resolution means drain settled, NOT that each accepted write succeeded.
   */
  lock(options?: { timeoutMs?: number }): Promise<void>;
}

export function createAccountSession(): AccountSession;
