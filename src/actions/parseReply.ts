import { parseJsonReply } from '../llm/extractJsonReply';
import { isActionKey } from './schema';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Preserve every argument and extra field for the compiler's normal validation.
function normalizeIntentWrappers(reply: unknown): unknown {
  if (!isObject(reply) || !Array.isArray(reply.blocks)) return reply;
  for (const block of reply.blocks) {
    if (!isObject(block) || block.type !== 'action' || !isObject(block.intent)) continue;
    const keys = Object.keys(block.intent);
    if (keys.length !== 1 || !isActionKey(keys[0])) continue;
    const args = block.intent[keys[0]];
    if (!isObject(args) || Object.prototype.hasOwnProperty.call(args, 'type')) continue;
    block.intent = { type: keys[0], ...args };
  }
  return reply;
}

/** Normalize transport and an unambiguous discriminator spelling; never infer actions. */
export function parseActionReply(text: string): unknown {
  return normalizeIntentWrappers(parseJsonReply(text,
    'Structured reply is not valid JSON. Expected one complete JSON object, optionally inside a JSON code fence. No actions were executed.'));
}
