import { describe, expect, it } from 'vitest';
import { parseJsonReply } from './extractJsonReply';

const value = { a: 1, b: ['x', 'y'] };
const json = JSON.stringify(value);

describe('parseJsonReply', () => {
  it.each([json, ` \n${json}\n`, `\`\`\`json\n${json}\n\`\`\``, `\`\`\`\r\n${json}\r\n\`\`\``])(
    'accepts plain JSON or one complete JSON fence (%#)',
    (text) => {
      expect(parseJsonReply(text)).toEqual(value);
    },
  );

  it('strips leading marked reasoning before parsing', () => {
    expect(parseJsonReply(`<think>not json</think>\n${json}`)).toEqual(value);
  });

  it('rejects malformed JSON with the default message', () => {
    expect(() => parseJsonReply('{broken')).toThrow(/not valid JSON/);
  });

  it('rejects trailing prose after a fence without guessing', () => {
    expect(() => parseJsonReply(`\`\`\`json\n${json}\n\`\`\`\nMore text`)).toThrow(/not valid JSON/);
  });

  it('uses a caller-supplied invalid-JSON message', () => {
    expect(() => parseJsonReply('{broken', 'Staged plan reply is not valid JSON.')).toThrow('Staged plan reply is not valid JSON.');
  });
});
