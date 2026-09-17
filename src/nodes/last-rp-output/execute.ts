import type { WorkflowNode } from '../../types';
import { formatLastMessageForContext } from '../../workflow/textHelpers';
import type { ExecuteContext } from '../types';

export async function executeLastRpOutputNode(node: WorkflowNode, context: ExecuteContext) {
  const latestOutputMessage = [...context.historyMessages]
    .reverse()
    .find((message) => message.role === 'output' && message.includeInHistory !== false);
  const text =
    (latestOutputMessage && (node.data.includeRpDateTime ||
      (latestOutputMessage.socialDirectMessage && latestOutputMessage.originalText === context.lastRpOutput)))
      ? formatLastMessageForContext(
          latestOutputMessage,
          false,
          context.rpDateTimeFormat,
          context.rpWeekdayLanguage,
          node.data.includeRpDateTime ?? false,
          context.appCharacters,
        )
      : context.lastRpOutput;
  context.updateRuntimeData(node.id, {
    preview: text ? 'Last RP output available' : 'No RP output yet',
    fullText: text,
  });
  return text;
}
