import type { Buffer } from 'node:buffer';
import type { AccountEntry } from './accountStore.cjs';

export interface PublicAccount { id: string; alias: string; protected: boolean; shared: boolean; protectionChangePending?: true }
/** Main-owned session capability. Never expose this object through preload/IPC. */
export interface AccountStorageView {
  readonly account: PublicAccount;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  list(): Promise<AccountEntry[]>;
  get(objectId: string, type: string): Promise<Buffer>;
  remove(objectId: string, type: string): Promise<void>;
  put(entry: { objectId: string; type: string; metadata?: unknown; data: Buffer }): Promise<void>;
}
export interface AccountManager {
  readonly state: 'locked' | 'unlocking' | 'active' | 'locking' | 'closed';
  dispose(): Promise<void>;
  captureStorage(): Promise<AccountStorageView>;
  listAccounts(): Promise<PublicAccount[]>;
  create(options: { alias: string; password?: string }): Promise<PublicAccount>;
  unlock(id: string, password?: string): Promise<PublicAccount>;
  /** Requires a locked manager. Omitting newPassword explicitly removes protection. */
  changeProtection(id: string, options: { currentPassword?: string; newPassword?: string }): Promise<PublicAccount>;
  recoverProtectionChange(id: string, password: string): Promise<PublicAccount>;
  rename(id: string, alias: string, password?: string): Promise<PublicAccount>;
  /** Caller must obtain an explicit deletion confirmation before invoking. */
  remove(id: string, password?: string): Promise<void>;
  /** Main-selected destination only; protected export inherits the unlocked account password. */
  exportAccount(destination: string): Promise<void>;
  importAccount(options: { source: string; alias: string; protection: 'password' | 'open'; password?: string; archivePassword?: string; requireReview?: boolean }): Promise<PublicAccount>;
  importFiles(options: { alias: string; password?: string; requireReview?: boolean; entries: AsyncIterable<{ relativePath: string; kind: 'file' | 'directory'; data: Buffer }> }): Promise<PublicAccount>;
  lock(options?: { timeoutMs?: number }): Promise<void>;
  listRecords(): Promise<AccountEntry[]>;
  get(objectId: string, type: string): Promise<Buffer>;
  put(entry: { objectId: string; type: string; metadata?: unknown; data: Buffer }): Promise<void>;
}
export function createAccountManager(options: { root: string }): Promise<AccountManager>;
