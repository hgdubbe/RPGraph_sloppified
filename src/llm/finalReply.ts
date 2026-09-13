/** Strip only explicitly delimited leading reasoning, never search it for an answer. */
export function finalReplyText(text: string): string {
  let reply = text.trim();
  while (true) {
    const opening = /^<(think|thinking|analysis)>/i.exec(reply);
    if (!opening) break;
    const close = new RegExp(`</${opening[1]}>`, 'i').exec(reply);
    if (!close) throw new Error('The model stopped during reasoning without a final reply. Increase the output token limit or use a model that returns a final answer.');
    reply = reply.slice(close.index + close[0].length).trim();
  }
  if (!reply) throw new Error('The model returned no final reply after reasoning. No action reply is available.');
  return reply;
}
