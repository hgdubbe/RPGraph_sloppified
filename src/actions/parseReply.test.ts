import { describe, expect, it } from 'vitest';
import { parseActionReply } from './parseReply';

const reply = { version: 1, catalogId: 'current', blocks: [{ type: 'text', text: 'A literal ``` and { brace }.' }] };
const json = JSON.stringify(reply);

describe('action reply transport parsing', () => {
  it.each([json, ` \n${json}\n`, `\`\`\`json\n${json}\n\`\`\``, `\`\`\`\r\n${json}\r\n\`\`\``, `\`\`\`JSON\n${json}\n\`\`\``])('accepts JSON or one complete JSON fence (%#)', (text) => {
    expect(parseActionReply(text)).toEqual(reply);
  });

  it.each(['', 'Here is the reply:\n' + json, json + json, `\`\`\`json\n${json}`, `\`\`\`javascript\n${json}\n\`\`\``, `\`\`\`json\n${json}\n\`\`\`\nMore text`, `\`\`\`json\n{broken}\n\`\`\``])('rejects malformed or ambiguous output without guessing (%#)', (text) => {
    expect(() => parseActionReply(text)).toThrow(/Structured reply|final reply/);
  });

  it('leaves schema validation to the action compiler', () => {
    expect(parseActionReply('{"unsupported":true}')).toEqual({ unsupported: true });
  });
  it('uses only the final fenced reply after reasoning', () => {
    expect(parseActionReply(`<think>{"wrong":"action example"}</think>\n\`\`\`json\n${json}\n\`\`\``)).toEqual(reply);
  });
  it.each(['messenger.send', 'image.generate'])('normalizes a single named %s intent without changing its arguments', (type) => {
    const args = { owner: 'person_1', description: 'A new photo', attachment: { type: 'stored_image', ref: 'image_9' } };
    const input = { ...reply, blocks: [{ type: 'action', intent: { [type]: args } }] };
    expect(parseActionReply(JSON.stringify(input))).toEqual({ ...reply, blocks: [{ type: 'action', intent: { type, ...args } }] });
  });
  it.each([
    { 'messenger.send': {}, 'image.generate': {} },
    { 'messenger.send': { type: 'image.generate' } },
    { type: 'messenger.send', 'messenger.send': {} },
    { 'unknown.action': {} },
    { 'messenger.send': [] },
  ])('does not guess ambiguous or unknown intents (%#)', (intent) => {
    const input = { ...reply, blocks: [{ type: 'action', intent }] };
    expect(parseActionReply(JSON.stringify(input))).toEqual(input);
  });
});
