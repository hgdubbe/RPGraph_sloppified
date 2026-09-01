import { describe, expect, test } from 'vitest';
import {
  roleplayActivityShortcutIconKind,
  type RoleplayActivityShortcutId,
} from './roleplayActivityShortcuts';

describe('roleplayActivityShortcutIconKind', () => {
  test.each([
    ['last-chat', 'chat'],
    ['last-message', 'messages'],
    ['last-post', 'social'],
    ['last-picture', 'gallery'],
  ] as const)('maps %s to the matching sidebar icon kind', (id, iconKind) => {
    expect(roleplayActivityShortcutIconKind(id satisfies RoleplayActivityShortcutId)).toBe(iconKind);
  });
});
