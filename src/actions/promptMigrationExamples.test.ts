import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileActionReply } from './compileReply';
import type { ActionCatalog } from './contracts';

describe('published prompt migration examples', () => {
  it('shows the complete default RP-with-image prompt and every rewrite change without omitted lines', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd();
    const workflow = JSON.parse(read('../../workflow.default_v25.json'));
    const node = workflow.nodes.find((entry: { id: string }) => entry.id === 'llm-prompt-switch-4f07f33e-3db7-4d8d-b3f9-4e5bee791e20');
    const route = node.data.responseRouter.outputs[0].routes[0];
    expect(route.title).toBe('RP Prompt with Image');
    expect(route.before).toBe('');
    const original = read('../../docs/guides/examples/rp-with-image.legacy.txt');
    const revised = read('../../docs/guides/examples/rp-with-image.actions-v1.txt');
    expect(original).toBe(route.after);
    expect(original).toBe(node.data.llmPromptSwitchPromptAftersByOutput[0][0]);
    const guide = read('../../docs/guides/action-prompt-migration.md');
    const diff = guide.match(/```diff\n([\s\S]*?)\n```/);
    expect(diff, 'The guide must contain the complete highlighted diff').not.toBeNull();
    const lines = diff![1].split('\n').filter((line) => !/^(---|\+\+\+|@@|diff |index )/.test(line));
    const reconstruct = (sign: string) => lines.filter((line) => line === '' || line.startsWith(' ') || line.startsWith(sign)).map((line) => line.slice(1)).join('\n').trimEnd();
    expect(reconstruct('-')).toBe(original);
    expect(reconstruct('+')).toBe(revised);
    expect(revised).toContain(original.split('\n\n')[1]);
    expect(revised).toContain('<Response Length>');
    expect(revised).not.toMatch(/^@(?:action|command):/m);
  });

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
