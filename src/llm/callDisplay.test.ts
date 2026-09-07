import { expect, it } from 'vitest';
import type { WorkflowNodeData } from '../types';
import { promptSwitchRouteLabel } from './callDisplay';
import { migrateRouter } from '../nodes/llm-prompt-switch/routerModel';

it('reports the actual last-run route instead of an editor selection', () => {
  const data = { nodeType: 'llm-prompt-switch', label: '', description: '', preview: '',
    llmPromptSwitchOutputTitles: ['Story', 'Phone'],
    llmPromptSwitchPromptTitlesByOutput: [['Narration'], ['Message']],
  } as WorkflowNodeData;
  data.responseRouter = migrateRouter(data);
  expect(promptSwitchRouteLabel(data)).toBeUndefined();
  data.responseRouterLastRun = { routeId: 'route-1-0', revision: 0, state: 'running', outputValue: '1', promptValue: '0' };
  expect(promptSwitchRouteLabel(data)).toBe('Phone / Message');
});
