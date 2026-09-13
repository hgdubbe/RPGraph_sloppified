import type { WorkflowNode } from '../../types';
import type { ExecuteContext } from '../types';
import type { DecisionRoutedContext } from '../../staged-workflow/decisionSceneContext';

export const decisionRouterInputHandles = {
  storybookJson: 'storybook-json',
  storybookText: 'storybook-text',
  storybookCharacters: 'storybook-characters',
  history: 'history',
  contextCompression: 'context-compression',
  lastInput: 'last-input',
  eventManager: 'event-manager',
} as const;

/** All 7 ports are optional — an unwired port resolves to `''`, never an error, since a route
 * may only care about some of decision-v1's context slices (see decisionSceneContext.ts's
 * `DecisionRoutedContext` doc comment on why every field there is optional too). */
async function resolveOptionalInput(node: WorkflowNode, context: ExecuteContext, targetHandle: string): Promise<string> {
  const edge = context.edges.find((candidate) => candidate.target === node.id && candidate.targetHandle === targetHandle);
  if (!edge) return '';
  return context.executeInput(edge.source, edge.sourceHandle);
}

/** Resolves every declared input port (reusing the same `context.executeInput` recursion
 * Response Router's own `resolveInput` uses — see llm-prompt-switch/execute.ts) and returns
 * the bundle as its single `default` JSON output. useGraphRun.ts calls `executeGraph` with
 * this node's own id as `outputNodeId` to get this value directly, without running the rest
 * of the graph (see decisionSceneContext.ts's `DecisionRoutedContext` doc comment). */
export async function executeDecisionRouterNode(node: WorkflowNode, context: ExecuteContext): Promise<string> {
  const [storybookJson, storybookText, storybookCharacters, history, contextCompression, lastInput, eventManager] = await Promise.all([
    resolveOptionalInput(node, context, decisionRouterInputHandles.storybookJson),
    resolveOptionalInput(node, context, decisionRouterInputHandles.storybookText),
    resolveOptionalInput(node, context, decisionRouterInputHandles.storybookCharacters),
    resolveOptionalInput(node, context, decisionRouterInputHandles.history),
    resolveOptionalInput(node, context, decisionRouterInputHandles.contextCompression),
    resolveOptionalInput(node, context, decisionRouterInputHandles.lastInput),
    resolveOptionalInput(node, context, decisionRouterInputHandles.eventManager),
  ]);
  const bundle: DecisionRoutedContext = {
    storybookJson, storybookText, storybookCharacters, history, contextCompression, lastInput, eventManager,
  };
  context.updateRuntimeData(node.id, { decisionRouterLastRun: { status: 'ok' } });
  return JSON.stringify(bundle);
}

/** Parses `executeDecisionRouterNode`'s own JSON output back into the typed bundle — used by
 * useGraphRun.ts after calling `executeGraph` against the Decision Router node's id. Returns
 * undefined on any malformed input rather than throwing, so a stale/corrupt runtime value
 * never blocks a turn — decision-v1 just falls back to its no-router behavior for that run. */
export function parseDecisionRoutedContext(text: string): DecisionRoutedContext | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed as DecisionRoutedContext;
  } catch {
    return undefined;
  }
}
