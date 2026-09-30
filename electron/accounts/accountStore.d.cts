import type { Buffer } from 'node:buffer';

export interface StoreOptions { root: string; accountId: string; key: Buffer }
export interface AccountEntry { objectId: string; type: string; revision: number; metadata: unknown }
export interface AccountSnapshot {
  entries: AccountEntry[];
  get(objectId: string, type: string): Promise<Buffer>;
}
export interface AccountStore {
  list(): Promise<AccountEntry[]>;
  /** Stable immutable generations; reads are revoked when the store closes. */
  snapshot(): Promise<AccountSnapshot>;
  get(objectId: string, type: string): Promise<Buffer>;
  /** Trusted main-process guard; called at write start and immediately before catalog publication. */
  put(entry: { objectId: string; type: string; metadata?: unknown; data: Buffer }, options?: { beforePublish?: () => void }): Promise<void>;
  remove(objectId: string, type: string, options?: { beforePublish?: () => void }): Promise<void>;
  close(): Promise<void>;
}
export function createAccountStore(options: StoreOptions): Promise<AccountStore>;
export function openAccountStore(options: StoreOptions): Promise<AccountStore>;
