import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { migrateRouter } from '../nodes/llm-prompt-switch/routerModel';
import type { WorkflowNodeData } from '../types';
import { splitPromptSections, sectionFields } from '../nodes/llm-prompt-switch/promptSections';

it('merges externally edited prompts by stable identity after presentation reorder', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'rpgraph-prompts-'));
  try {
    const workflowPath = path.join(directory, 'workflow.json');
    const promptsPath = path.join(directory, 'prompts.json');
    const resultPath = path.join(directory, 'result.json');
    const data = { nodeType: 'llm-prompt-switch', label: 'Router', description: '', preview: '',
      llmPromptSwitchOutputTitles: ['Story'], llmPromptSwitchPromptTitlesByOutput: [['First', 'Second']],
      llmPromptSwitchPromptBeforesByOutput: [['one', 'two']],
    } as WorkflowNodeData;
    data.responseRouter = migrateRouter(data);
    const workflow = { format: 'rpgraph-workflow', formatVersion: '1.2', nodes: [{ id: 'router', data }], edges: [] };
    writeFileSync(workflowPath, JSON.stringify(workflow));
    const script = path.resolve('scripts/workflow-prompts.mjs');
    execFileSync(process.execPath, [script, 'extract', workflowPath, promptsPath]);
    const prompts = JSON.parse(readFileSync(promptsPath, 'utf8'));
    prompts.switches[0].outputs[0].prompts[0].before = 'edited externally';
    writeFileSync(promptsPath, JSON.stringify(prompts));
    data.responseRouter.outputs[0].routes.reverse();
    writeFileSync(workflowPath, JSON.stringify(workflow));
    execFileSync(process.execPath, [script, 'merge', promptsPath, workflowPath, resultPath]);
    const result = JSON.parse(readFileSync(resultPath, 'utf8')).nodes[0].data.responseRouter;
    expect(result.outputs[0].routes[1].before).toBe('edited externally');
    expect(result.outputs[0].routes[0].before).toBe('two');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('exports structured fields and merges their edits without stale raw text', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'rpgraph-sections-'));
  try {
    const workflowPath = path.join(directory, 'workflow.json');
    const promptsPath = path.join(directory, 'prompts.json');
    const resultPath = path.join(directory, 'result.json');
    const data = { nodeType: 'llm-prompt-switch', label: 'Router', description: '', preview: '',
      llmPromptSwitchOutputTitles: ['Story'], llmPromptSwitchPromptTitlesByOutput: [['RP']],
      llmPromptSwitchPromptAftersByOutput: [['The tone is warm.']],
    } as WorkflowNodeData;
    data.responseRouter = migrateRouter(data);
    const route = data.responseRouter.outputs[0].routes[0];
    route.sections = splitPromptSections(route.before, route.after);
    writeFileSync(workflowPath, JSON.stringify({ nodes: [{ id: 'router', data }], edges: [] }));
    const script = path.resolve('scripts/workflow-prompts.mjs');
    execFileSync(process.execPath, [script, 'extract', workflowPath, promptsPath]);
    const prompts = JSON.parse(readFileSync(promptsPath, 'utf8'));
    expect(prompts.formatVersion).toBe(2);
    const prompt = prompts.switches[0].outputs[0].prompts[0];
    expect(prompt.after).toBeUndefined();
    sectionFields(prompt.sections).find((field) => field.category === 'tone')!.text = 'A different tone.';
    writeFileSync(promptsPath, JSON.stringify(prompts));
    execFileSync(process.execPath, [script, 'merge', promptsPath, workflowPath, resultPath]);
    const result = JSON.parse(readFileSync(resultPath, 'utf8')).nodes[0].data;
    expect(result.responseRouter.outputs[0].routes[0].after).toBe('A different tone.');
    expect(result.llmPromptSwitchPromptAftersByOutput[0][0]).toBe('A different tone.');
    prompt.sections.after[0].role = 'intermediate';
    writeFileSync(promptsPath, JSON.stringify(prompts));
    expect(() => execFileSync(process.execPath, [script, 'merge', promptsPath, workflowPath, resultPath], { stdio: 'pipe' })).toThrow();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
