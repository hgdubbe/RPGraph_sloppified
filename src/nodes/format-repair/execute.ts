import type { WorkflowNode } from '../../types';
import { repairFormattedText, type FormatRepairMode } from '../../workflow';
import type { ExecuteContext } from '../types';

function formatRepairMode(value: unknown): FormatRepairMode {
  return value === 'json' ? 'json' : 'text';
}

export async function executeFormatRepairNode(node: WorkflowNode, context: ExecuteContext) {
  const incomingEdge = context.edges.find((edge) => edge.target === node.id);
  const inputValue = incomingEdge
    ? await context.executeInput(incomingEdge.source, incomingEdge.sourceHandle)
    : '';
  const mode = formatRepairMode(node.data.formatRepairMode);
  const repaired = repairFormattedText(inputValue, mode);
  const repairCount = repaired.repairs.length;

  context.updateRuntimeData(node.id, {
    preview: mode === 'json'
      ? repaired.validJson
        ? repairCount
          ? `JSON repaired (${repairCount})`
          : 'JSON already valid'
        : repairCount
          ? `JSON repaired (${repairCount}); still invalid`
          : 'JSON invalid'
      : repairCount
        ? `Text cleaned (${repairCount})`
        : 'Text unchanged',
    fullText: repaired.text,
    formatRepairValidJson: repaired.validJson,
    formatRepairLastRepairs: repaired.repairs,
    displayTokenBytesPerToken: context.textMetrics.bytesPerToken,
  });
  return repaired.text;
}
