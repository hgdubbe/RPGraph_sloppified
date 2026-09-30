import type { Buffer } from 'node:buffer';
import type { Stats } from 'node:fs';
export interface LegacyCleanupPlan {
  record(source: { relativePath: string; data: Buffer; stat: Stats }): void;
  preview(): { root: string; retainedProtected: number; files: Array<{ relativePath: string; size: number }> };
  erase(options?: { consent?: boolean; assertCanDelete?: () => void }): Promise<{ deleted: string[]; skipped: string[]; retainedProtected: number }>;
}
export interface CleanupDialogOptions {
  title: string; type: 'question' | 'warning' | 'info'; message: string; detail: string;
  buttons: string[]; defaultId: number; cancelId: number; checkboxLabel?: string; checkboxChecked?: boolean;
}
export function createLegacyCleanupPlan(options: { root: string }): LegacyCleanupPlan;
export function offerLegacyCleanup(options: {
  plan: LegacyCleanupPlan; account: { alias: string; protected: boolean }; preferenceKeys?: string[];
  showMessageBox: (options: CleanupDialogOptions) => Promise<{ response: number; checkboxChecked?: boolean }>;
  deletePreferences?: () => Promise<{ deleted: number; skipped: number }>;
  openFolder?: (root: string) => Promise<unknown>; assertCanDelete?: () => void;
}): Promise<void>;
