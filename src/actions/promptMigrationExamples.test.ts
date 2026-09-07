import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileActionReply } from './compileReply';
import type { ActionCatalog } from './contracts';

describe('published prompt migration examples', () => {
  it('compiles every JSON example in the guide with the documented capabilities', () => {
    const guide = readFileSync(new URL('../../docs/guides/action-prompt-migration.md', import.meta.url), 'utf8');
    const examples = [...guide.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)];
    expect(examples).toHaveLength(5);
    const scope = { saveId: 'example-save', branchId: 'example-branch', turnId: 'example-turn', catalogId: 'example-catalog' };
    const shared = { saveId: scope.saveId, branchId: scope.branchId, state: 'available' as const };
    const catalog: ActionCatalog = { scope, entries: [
      { ...shared, handle: 'person_1', id: 'alice', kind: 'character', capabilities: ['whatsup.send', 'image.generate'] },
      { ...shared, handle: 'person_2', id: 'bob', kind: 'character', capabilities: ['whatsup.receive'] },
      { ...shared, handle: 'image_1', id: 'stored-image', kind: 'image', accessibleTo: ['alice'] },
    ] };
    let next = 0;
    for (const [, json] of examples) {
      const result = compileActionReply(JSON.parse(json), catalog, scope, () => `example-${++next}`);
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
  });
});
