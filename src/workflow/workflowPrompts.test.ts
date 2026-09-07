import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { migrateRouter } from '../nodes/llm-prompt-switch/routerModel';
import type { WorkflowNodeData } from '../types';

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
