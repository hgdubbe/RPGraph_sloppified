import type { Buffer } from 'node:buffer';
export function readLegacyAccountFiles(options: {
  root: string; signal?: AbortSignal; preferences?: Record<string, string>;
  transformSettings?: (settings: unknown) => unknown | Promise<unknown>;
  onSourceFile?: (source: { relativePath: string; data: Buffer; stat: import('node:fs').Stats }) => void | Promise<void>;
}): AsyncGenerator<{ relativePath: string; kind: 'file' | 'directory'; data: Buffer }>;
export const legacyFiles: string[];
export const legacyDirectories: string[];
export function legacyDataAvailable(options: { root: string }): Promise<boolean>;
