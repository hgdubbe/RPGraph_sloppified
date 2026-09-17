import type { WorkflowNode } from '../../types';
import { formatLastMessageForContext } from '../../workflow/textHelpers';
import type { ExecuteContext } from '../types';

export async function executeLastUserInputNode(node: WorkflowNode, context: ExecuteContext) {
  const latestUserMessage = [...context.historyMessages]
    .reverse()
    .find((message) => message.role === 'user' && message.includeInHistory !== false);
  const text =
    (latestUserMessage && latestUserMessage.originalText === context.visibleInput &&
      (node.data.includeRpDateTime || latestUserMessage.socialDirectMessage))
      ? formatLastMessageForContext(
          latestUserMessage,
          false,
          context.rpDateTimeFormat,
          context.rpWeekdayLanguage,
          node.data.includeRpDateTime ?? false,
          context.appCharacters,
        )
      : context.visibleInput;
  context.updateRuntimeData(node.id, {
    preview: text ? 'Last user input available' : 'No user input yet',
    fullText: text,
  });
  return text;
}
