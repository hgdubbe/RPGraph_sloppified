import type { WorkflowNode } from '../../types';
import { extractWorkflowVariableSetCommands, resolveWorkflowVariables } from '../../workflow';
import type { ExecuteContext } from '../types';

export async function executeOutputNode(node: WorkflowNode, context: ExecuteContext) {
  const targetHandle = context.sourceHandle ?? 'default';
  const incomingEdge = context.edges.find((edge) =>
    edge.target === node.id &&
    (targetHandle === 'default'
      ? !edge.targetHandle || edge.targetHandle === 'default'
      : edge.targetHandle === targetHandle),
  );
  if (!incomingEdge) {
    if (targetHandle !== 'default') {
      return '';
    }
    throw new Error(`${node.data.label} has no incoming connection.`);
  }
  const inputValue = await context.executeInput(incomingEdge.source, incomingEdge.sourceHandle);
  if (context.structuredActionContext) return inputValue;
  const extracted = extractWorkflowVariableSetCommands(inputValue);
  if (extracted.commands.length > 0) {
    context.setWorkflowVariables(extracted.commands);
  }
  return resolveWorkflowVariables(
    extracted.text,
    context.settingsValueDefinitions,
    context.settingsValues,
  );
}
