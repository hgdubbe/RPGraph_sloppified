export type AssistantChatMessageShape = { role: 'user' | 'assistant'; text: string };

/**
 * Shared alternation/shape validator for `assistant.chat`'s `messages` field: 2-8
 * entries, strictly alternating starting with `user`. Used by both `compileReply.ts`
 * (actions-v1, model-authored JSON envelope) and the staged-workflow `messages`
 * content step (which parses the same shape out of a raw LLM JSON reply) so the two
 * protocols can't drift on what counts as a valid conversation.
 */
export function validateAssistantChatMessages(
  raw: unknown,
  options: { maxTextLength: number; fail: (path: string, message: string) => never },
): AssistantChatMessageShape[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 8 || raw.length % 2 !== 0) {
    options.fail('messages', 'Expected 2 to 8 messages (1 to 4 alternating exchanges), starting with the user.');
  }
  const list = raw as unknown[];
  return list.map((entry, index) => {
    const entryPath = `messages[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      options.fail(entryPath, 'Expected an object.');
    }
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== 'role' && key !== 'text') options.fail(`${entryPath}.${key}`, `Unexpected field "${key}".`);
    }
    const expectedRole = index % 2 === 0 ? 'user' as const : 'assistant' as const;
    if (record.role !== expectedRole) options.fail(`${entryPath}.role`, `Expected "${expectedRole}" at this position.`);
    const text = record.text;
    if (typeof text !== 'string' || !text.trim() || text.length > options.maxTextLength) {
      options.fail(`${entryPath}.text`, `Expected a non-empty string of at most ${options.maxTextLength} characters.`);
    }
    return { role: expectedRole, text: text as string };
  });
}
