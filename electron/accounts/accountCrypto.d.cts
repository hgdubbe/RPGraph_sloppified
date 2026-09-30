import type { Buffer } from 'node:buffer';

export interface RecordContext {
  accountId: string;
  objectId: string;
  type: string;
  revision: number;
}
export interface RecordEnvelope {
  format: 'rpgraph-account-record';
  version: 1;
  nonce: string;
  tag: string;
  ciphertext: string;
}
export interface KeyEnvelope {
  format: 'rpgraph-account-key';
  version: 1;
  kdf: { name: 'scrypt'; N: 131072; r: 8; p: 1 };
  salt: string;
  nonce: string;
  tag: string;
  ciphertext: string;
}
export const maxRecordBytes: number;
export function createKeyEnvelope(password: string, accountId: string): Promise<{ key: Buffer; envelope: KeyEnvelope }>;
/** Main-process only. Wraps a snapshot of the key; does not mutate the caller's buffer. */
export function wrapKey(key: Buffer, password: string, accountId: string): Promise<KeyEnvelope>;
export function unlockKey(envelope: unknown, password: string, accountId: string): Promise<Buffer>;
export function encryptRecord(key: Buffer, context: RecordContext, plaintext: Buffer): RecordEnvelope;
export function decryptRecord(key: Buffer, context: RecordContext, envelope: unknown): Buffer;
