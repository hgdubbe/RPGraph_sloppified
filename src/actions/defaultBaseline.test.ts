import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../nodes/registry';
import { isWorkflowFile } from '../workflow/validation';
import { validateRouter } from '../nodes/llm-prompt-switch/routerModel';
import { assembleSections, sectionFields } from '../nodes/llm-prompt-switch/promptSections';
import type { WorkflowFile } from '../types';

const read = (name: string): WorkflowFile => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
describe.each(['', '-planning'])('importable action baseline %s', (variant) => {
  const baseline = read(`../../workflows/default${variant}-actions-v1.json`);
  const original = read(`../../default_workflows/workflow.default${variant ? '_planning' : ''}_v26.json`);
  it('is a valid complete workflow and preserves the original graph and storybook', () => {
    expect(isWorkflowFile(baseline)).toBe(true);
    expect(baseline.edges).toEqual(original.edges);
    expect(baseline.nodes).toHaveLength(original.nodes.length);
    for (const node of baseline.nodes.filter((node) => !['llm-prompt-switch', 'output'].includes(node.data.nodeType))) {
      expect(node).toEqual(original.nodes.find((source) => source.id === node.id));
    }
    expect(baseline.nodes.find((node) => node.data.nodeType === 'output')?.data.actionProtocol).toBe('actions-v1');
  });

  it('migrates all twelve RP/WhatsUp routes to creative-only sections without changing identity', () => {
    const router = baseline.nodes.find((node) => node.data.nodeType === 'llm-prompt-switch')!.data;
    const config = router.responseRouter!;
    expect(validateRouter(config)).toEqual([]);
    const routes = config.outputs.filter((group) => group.selector < 2).flatMap((group) => group.routes);
    expect(routes).toHaveLength(12);
    for (const group of config.outputs.filter((group) => group.selector < 2)) {
      for (const route of group.routes) {
        const assembled = assembleSections(route.sections!);
        expect(assembled).toEqual({ before: route.before, after: route.after });
        expect(route.before + route.after).not.toMatch(/@(?:action|command):|catalogId|sendImageId|hidden action|messenger\.send/);
        expect(sectionFields(route.sections!).some((field) => field.category === 'tone' && field.role === 'response')).toBe(true);
        expect(router.llmPromptSwitchPromptAftersByOutput![group.selector][route.selector]).toBe(route.after);
        if (variant) {
          const fields = sectionFields(route.sections!);
          const source = original.nodes.find((node) => node.data.responseRouter)!.data.responseRouter!
            .outputs[group.selector].routes.find((entry) => entry.id === route.id)!;
          for (const category of ['task', 'objective', 'npc', 'knowledge', 'focus', 'outcomes']) {
            expect(fields.find((field) => field.step === 'planning' && field.category === category)?.text)
              .toBe(sectionFields(source.sections!).find((field) => field.step === 'planning' && field.category === category)?.text);
          }
          expect(route.after).toContain('@step:planning');
          expect(route.after).toContain('@step:main');
          expect(route.after).toContain('@output:planning');
          expect(fields.filter((field) => field.step === 'planning').some((field) => field.category === 'tone')).toBe(false);
          expect(route.after).not.toMatch(/imageId|MessengerAppName/);
        }
      }
    }
  });

  it('preserves social/autoplay prompts and their compatibility action configurations', () => {
    const get = (workflow: WorkflowFile) => workflow.nodes.find((node) => node.data.nodeType === 'llm-prompt-switch')!.data;
    expect(get(baseline).responseRouter!.outputs.slice(2)).toEqual(get(original).responseRouter!.outputs.slice(2));
    expect(get(baseline).llmPromptActions).toEqual(get(original).llmPromptActions);
    expect(get(baseline).llmPromptCommands).toEqual(get(original).llmPromptCommands);
  });
});
