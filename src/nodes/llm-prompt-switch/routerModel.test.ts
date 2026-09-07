import { describe, expect, it } from 'vitest';
import type { WorkflowNodeData } from '../../types';
import { applyLegacyRouterPatch, assemblePrompt, migrateRouter, resolveRoute, routerAwarePatch, validateRouter } from './routerModel';
import { corePersistence } from '../corePersistence';

const legacy = {
  nodeType: 'llm-prompt-switch', label: 'Router', description: '', preview: '',
  llmPromptSwitchOutputTitles: ['Story', 'Phone'],
  llmPromptSwitchPromptTitlesByOutput: [['First', 'Second'], ['Reply']],
  llmPromptSwitchPromptBeforesByOutput: [['before @step 0', 'other'], ['phone']],
  llmPromptSwitchPromptAftersByOutput: [['after', ''], ['']],
} as WorkflowNodeData;

describe('Response Router compatibility', () => {
  it('adapts older authored-field callers while leaving runtime-only patches untouched', () => {
    const data = { ...legacy, responseRouter: migrateRouter(legacy) };
    const adapted = routerAwarePatch(data, { llmPromptSwitchPromptBeforesByOutput: [['changed', 'other'], ['phone']] });
    expect(adapted.responseRouter?.outputs[0].routes[0].before).toBe('changed');
    const runtime = { preview: 'Running' };
    expect(routerAwarePatch(data, runtime)).toBe(runtime);
  });
  it('assembles a preview without changing authored text or consuming step references', () => {
    const route = migrateRouter(legacy).outputs[0].routes[0];
    route.before = '  @step:plan\nPlan\n@step:reply\n@output:plan  ';
    const original = route.before;
    const assembled = assemblePrompt(route, 'captured input', [], {});
    expect(assembled.combinedPrompt).toBe(`${original.trim()}\n\ncaptured input\n\nafter`);
    expect(route.before).toBe(original);
  });
  it('roundtrips stable records through core persistence and strips run metadata', () => {
    const config = migrateRouter(legacy);
    config.outputs.reverse();
    const saved = corePersistence['llm-prompt-switch'].saveData({ ...legacy, responseRouter: config,
      responseRouterLastRun: { routeId: 'route-0-0', revision: 0, state: 'success', outputValue: '0', promptValue: '0' } });
    expect(saved.responseRouter).toEqual(config);
    expect(saved.responseRouterLastRun).toBeUndefined();
    const loaded = corePersistence['llm-prompt-switch'].hydrateData(saved, { defaultConnectionId: '', connectionIds: new Set() });
    expect(loaded.responseRouter).toEqual(config);
  });
  it('preserves every valid pair, exact prompt strings and external handle', () => {
    const config = migrateRouter(legacy);
    for (const [output, slots] of [[0, 2], [1, 1]]) {
      for (let slot = 0; slot < slots; slot++) {
        const result = resolveRoute(config, String(output), String(slot));
        expect(result.output.handle).toBe(`output-channel-${output}`);
        expect(result.route.before).toBe(legacy.llmPromptSwitchPromptBeforesByOutput![output][slot]);
      }
    }
    expect(config.policy).toBe('legacy');
  });

  it('retains legacy truncation, clamping, nonnumeric and slot-zero fallback', () => {
    const config = migrateRouter(legacy);
    expect(resolveRoute(config, '99', '9').route.before).toBe('phone');
    expect(resolveRoute(config, '0.9', '1.9').route.before).toBe('other');
    expect(resolveRoute(config, 'bad', 'bad').route.before).toBe('before @step 0');
  });

  it('keeps remaining mappings after deletion and never reuses the deleted selector', () => {
    const original = migrateRouter(legacy);
    const data = { ...legacy, responseRouter: original, llmPromptSwitchSelectedPromptSlot: 0 };
    const removed = applyLegacyRouterPatch(data, {
      llmPromptSwitchPromptTitlesByOutput: [['Second'], ['Reply']],
      llmPromptSwitchPromptBeforesByOutput: [['other'], ['phone']],
      llmPromptSwitchPromptAftersByOutput: [[''], ['']],
    });
    expect(removed.outputs[0].routes[0].id).toBe(original.outputs[0].routes[1].id);
    expect(resolveRoute({ ...removed, policy: 'strict' }, '0', '1').route.before).toBe('other');
    expect(() => resolveRoute({ ...removed, policy: 'strict' }, '0', '0')).toThrow('No route');
    const added = applyLegacyRouterPatch({ ...data, responseRouter: removed }, {
      llmPromptSwitchPromptTitlesByOutput: [['Second', 'New'], ['Reply']],
    });
    expect(added.outputs[0].routes[1].selector).toBe(2);
  });

  it('preserves output handles and selectors when an earlier group is removed', () => {
    const config = applyLegacyRouterPatch({ ...legacy, llmPromptSwitchSelectedOutputChannel: 0 }, {
      llmPromptSwitchOutputTitles: ['Phone'],
      llmPromptSwitchPromptTitlesByOutput: [['Reply']],
      llmPromptSwitchPromptBeforesByOutput: [['phone']],
      llmPromptSwitchPromptAftersByOutput: [['']],
    });
    expect(config.outputs[0].handle).toBe('output-channel-1');
    expect(resolveRoute({ ...config, policy: 'strict' }, '1', '0').route.before).toBe('phone');
  });

  it('separates presentation ordering from selector mappings', () => {
    const config = migrateRouter(legacy);
    config.outputs.reverse();
    config.outputs[1].routes.reverse();
    config.outputs[1].title = 'Renamed';
    expect(resolveRoute(config, '0', '1').route.before).toBe('other');
  });

  it('rejects invalid strict selectors and duplicate mappings', () => {
    const config = { ...migrateRouter(legacy), policy: 'strict' as const };
    for (const value of ['', 'bad', '0.5', '-1', '100']) {
      expect(() => resolveRoute(config, value, '0')).toThrow();
    }
    config.outputs[0].routes[1].selector = 0;
    expect(validateRouter(config).join(' ')).toContain('Duplicate');
    expect(() => resolveRoute(config, '0', '0')).toThrow('Duplicate');
  });
});
