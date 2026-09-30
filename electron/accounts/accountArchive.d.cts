import type { Buffer } from 'node:buffer';
import type { KeyEnvelope } from './accountCrypto.cjs';

export interface ArchiveEntry {
  id: string;
  type: string;
  revision: number;
  metadata: unknown;
}
export interface ArchiveSourceEntry extends ArchiveEntry {
  /** Trusted snapshot source; use bounded input chunks and no mutable account globals. */
  data: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}
export interface OpenAccountArchive {
  readonly accountId: string;
  readonly protection: 'plain' | 'encrypted';
  /** Available only after the entire archive passed validation/authentication. */
  readonly entries: ArchiveEntry[];
  /** Revalidates each chunk on every read; no extraction or path-following. */
  read(id: string): AsyncIterable<Buffer>;
  /** Caller must close in finally to release the file handle and derived key. */
  close(): void;
}
/** Main-process only. Both key and matching wrapper are required for protection. */
export function writeAccountArchive(options: {
  destination: string;
  accountId: string;
  entries: AsyncIterable<ArchiveSourceEntry> | Iterable<ArchiveSourceEntry>;
  signal?: AbortSignal;
  key?: Buffer;
  keyEnvelope?: KeyEnvelope;
}): Promise<void>;
export function openAccountArchive(options: {
  source: string; password?: string; signal?: AbortSignal;
}): Promise<OpenAccountArchive>;
/** Explicit downgrade: writes a new canonical plaintext ZIP, including credentials if present. */
export function decryptAccountArchive(options: {
  source: string; destination: string; password?: string; signal?: AbortSignal;
}): Promise<void>;
