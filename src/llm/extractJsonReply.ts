import { finalReplyText } from './finalReply';

const defaultInvalidMessage = 'Reply is not valid JSON. Expected one complete JSON object, optionally inside a JSON code fence.';

/**
 * Strip leading reasoning and one optional enclosing JSON code fence, then parse.
 * Never repairs malformed JSON, extracts embedded objects, or accepts trailing prose.
 * Shared by the action-reply parser and the staged-workflow plan-call parser so both
 * accept exactly the same transport shape.
 */
export function parseJsonReply(text: string, invalidMessage = defaultInvalidMessage): unknown {
  const trimmed = finalReplyText(text);
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    throw new Error(invalidMessage);
  }
}
